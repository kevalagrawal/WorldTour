import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { z } from 'zod'
import { config, configured } from '../config.js'
import { connectDatabase } from '../db.js'
import { HttpError, parse } from '../middleware/errors.js'
import { decrypt, encrypt, FREE_SERVICES, SERVICES, serviceIds, testKey } from '../lib/apiKeys.js'
import { ApiKey } from '../models/ApiKey.js'
import { Trip } from '../models/Trip.js'
import { User } from '../models/User.js'

/**
 * The private admin dashboard's API.
 *
 *   POST /api/admin/session   { code }  → { token, expiresAt }   (code = ADMIN_CODE on the server)
 *   GET  /api/admin/overview            totals, sign-ups and trips per day, top destinations
 *   GET  /api/admin/users               search, sort, page
 *   GET  /api/admin/users/:id           everything about one user, with their trips
 *   GET  /api/admin/trips/:id           one trip: conversation, every itinerary version, notes, sharing
 *   DELETE /api/admin/users/:id         delete an account: sign-in (Clerk), photo, trips and profile
 *   GET    /api/admin/apis              outside APIs, the planner's own keys and the spare keys
 *   POST   /api/admin/apis/:service/keys   add a spare key (tested first where that is free)
 *   POST   /api/admin/apis/keys/:id/check  test a spare key again (credits left, still valid)
 *   DELETE /api/admin/apis/keys/:id     remove a spare key
 *
 * The code never reaches the browser bundle. A correct code returns a signed pass valid for 2 hours
 * (header "Authorization: Admin <token>") valid for 5 minutes; changing ADMIN_CODE invalidates every pass. Wrong codes are
 * limited to 5 per 15 minutes per address, so the 6-digit code cannot be guessed by brute force.
 */

const SESSION_MS = 5 * 60 * 1000 // the dashboard locks itself after 5 minutes
const codeBody = z.object({ code: z.string().trim().min(1).max(64) })
const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['recent', 'oldest', 'active', 'name', 'trips']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const signingKey = () => createHash('sha256').update(`worldtour-admin:${config.adminCode}:${config.clerk.secretKey || config.mongoUri}`).digest()
const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url')

function sameText(a, b) {
  const x = createHash('sha256').update(String(a)).digest()
  const y = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(x, y)
}

function issueToken() {
  const expiresAt = Date.now() + SESSION_MS
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: expiresAt })).toString('base64url')
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAt).toISOString() }
}

function requireAdmin(req, _res, next) {
  if (!config.adminCode) return next(new HttpError(503, 'The admin dashboard is switched off (ADMIN_CODE is not set).'))
  const [scheme, token = ''] = String(req.headers.authorization || '').split(' ')
  const [payload, signature] = token.split('.')
  if (scheme !== 'Admin' || !payload || !signature || !sameText(signature, sign(payload))) {
    return next(new HttpError(401, 'Enter the admin code to continue.'))
  }
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!exp || exp < Date.now()) return next(new HttpError(401, 'The admin session expired. Enter the code again.'))
  } catch {
    return next(new HttpError(401, 'Enter the admin code to continue.'))
  }
  next()
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const objectId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Not found.')
  return new mongoose.Types.ObjectId(id)
}

function userRow(user, tripCount = 0) {
  return {
    id: user._id.toString(),
    clerkId: user.clerkId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    photoUrl: user.photo?.url || '',
    onboarded: !!user.onboarded,
    surveyDone: !!user.surveyDone,
    preferences: user.preferences ?? {},
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt: user.lastActiveAt,
    trips: tripCount,
  }
}

export function adminRoutes({ identity, photos }) {
  const router = Router()

  // Wrong codes report how many of the MAX_ATTEMPTS were used, so the code screen can show it.
  const MAX_ATTEMPTS = 5
  const attempts = (req) => {
    const info = req.rateLimit ?? { used: 0, resetTime: null }
    const used = Math.min(info.used ?? 0, MAX_ATTEMPTS)
    return { attempts: used, maxAttempts: MAX_ATTEMPTS, remaining: MAX_ATTEMPTS - used, retryAt: info.resetTime ?? null }
  }
  router.post(
    '/session',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: MAX_ATTEMPTS,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ error: 'Too many wrong codes. The code screen is locked for 15 minutes.', locked: true, ...attempts(req) }),
    }),
    (req, res) => {
      if (!config.adminCode) throw new HttpError(503, 'The admin dashboard is switched off (ADMIN_CODE is not set).')
      const { code } = parse(codeBody, req.body)
      if (!sameText(code, config.adminCode)) {
        const info = attempts(req)
        return res.status(401).json({ error: 'That code is not right.', locked: info.remaining <= 0, ...info })
      }
      res.json(issueToken())
    },
  )

  router.use(requireAdmin)
  router.use(async (_req, _res, next) => {
    try {
      await connectDatabase()
      next()
    } catch (error) {
      next(error)
    }
  })

  router.get('/overview', async (_req, res) => {
    // Days are UTC days, the same as the $dateToString keys below.
    const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    since.setUTCHours(0, 0, 0, 0)
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
    const [users, active, onboarded, tripTotals, signups, tripsByDay, destinations, recentUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: week } }),
      User.countDocuments({ surveyDone: true }),
      Trip.aggregate([
        {
          $group: {
            _id: null,
            trips: { $sum: 1 },
            planned: { $sum: { $cond: [{ $gt: [{ $size: '$versions' }, 0] }, 1, 0] } },
            shared: { $sum: { $cond: [{ $eq: ['$share.enabled', true] }, 1, 0] } },
            versions: { $sum: { $size: '$versions' } },
            prompts: { $sum: { $size: { $filter: { input: '$messages', cond: { $eq: ['$$this.role', 'user'] } } } } },
            spend: { $sum: { $ifNull: ['$estimatedCost', 0] } },
          },
        },
      ]),
      User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: day, count: { $sum: 1 } } }]),
      Trip.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: day, count: { $sum: 1 } } }]),
      Trip.aggregate([
        { $match: { destination: { $nin: ['', null, 'Multi-city'] } } },
        { $group: { _id: '$destination', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 8 },
      ]),
      User.find().sort({ createdAt: -1 }).limit(5).lean(),
    ])
    const series = (rows) => {
      const map = Object.fromEntries(rows.map((row) => [row._id, row.count]))
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        return { date: key, count: map[key] ?? 0 }
      })
    }
    const totals = tripTotals[0] ?? { trips: 0, planned: 0, shared: 0, versions: 0, prompts: 0 }
    res.json({
      totals: { users, activeThisWeek: active, completedSurvey: onboarded, trips: totals.trips, planned: totals.planned, shared: totals.shared, itineraries: totals.versions, prompts: totals.prompts },
      signups: series(signups),
      trips: series(tripsByDay),
      destinations: destinations.map((row) => ({ name: row._id, trips: row.count })),
      recentUsers: recentUsers.map((user) => userRow(user)),
    })
  })

  router.get('/users', async (req, res) => {
    const q = parse(listQuery, req.query)
    const filter = {}
    if (q.search) {
      const pattern = new RegExp(escapeRegex(q.search), 'i')
      filter.$or = [{ fullName: pattern }, { email: pattern }, { phone: pattern }, { 'preferences.homeCity': pattern }]
    }
    const sort = { recent: { createdAt: -1 }, oldest: { createdAt: 1 }, active: { lastActiveAt: -1 }, name: { fullName: 1 }, trips: { createdAt: -1 } }[q.sort ?? 'recent']
    const limit = q.limit ?? 30
    const page = q.page ?? 1
    const [total, users] = await Promise.all([User.countDocuments(filter), User.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean()])
    const counts = await Trip.aggregate([
      { $match: { user: { $in: users.map((u) => u._id) } } },
      { $group: { _id: '$user', trips: { $sum: 1 }, last: { $max: '$updatedAt' }, destination: { $last: '$destination' } } },
    ])
    const byUser = Object.fromEntries(counts.map((row) => [row._id.toString(), row]))
    let rows = users.map((user) => ({ ...userRow(user, byUser[user._id.toString()]?.trips ?? 0), lastTripAt: byUser[user._id.toString()]?.last ?? null, lastDestination: byUser[user._id.toString()]?.destination ?? '' }))
    if (q.sort === 'trips') rows = rows.sort((a, b) => b.trips - a.trips)
    res.json({ users: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
  })

  router.get('/users/:id', async (req, res) => {
    const user = await User.findById(objectId(req.params.id)).lean()
    if (!user) throw new HttpError(404, 'User not found.')
    const trips = await Trip.find({ user: user._id }).sort({ updatedAt: -1 }).select('-session -selection -versions.plan').lean({ virtuals: false })
    res.json({
      user: userRow(user, trips.length),
      trips: trips.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        origin: t.origin,
        destination: t.destination,
        cities: t.cities ?? [],
        startDate: t.startDate,
        durationDays: t.durationDays,
        travelers: t.travelers,
        estimatedCost: t.estimatedCost,
        currency: t.currency,
        status: t.status,
        favorite: !!t.favorite,
        shared: !!t.share?.enabled,
        versions: t.versions?.length ?? 0,
        prompts: (t.messages ?? []).filter((m) => m.role === 'user').length,
        firstPrompt: t.messages?.find((m) => m.role === 'user')?.content ?? '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  })

  router.delete('/users/:id', async (req, res) => {
    const user = await User.findById(objectId(req.params.id))
    if (!user) throw new HttpError(404, 'User not found.')
    // The sign-in goes first: if Clerk refuses, nothing is deleted and the admin can try again.
    // (Otherwise the person could sign in again and get an empty profile back.)
    await identity.deleteUser(user.clerkId).catch((error) => {
      if (error?.status !== 404) throw new HttpError(502, `Clerk could not delete the sign-in: ${error?.message || 'unknown error'}`)
    })
    await Promise.resolve(photos.destroy?.(user.photo?.publicId)).catch(() => undefined)
    const { deletedCount: trips } = await Trip.deleteMany({ user: user._id })
    await user.deleteOne()
    console.info(JSON.stringify({ event: 'admin_deleted_user', userId: user._id.toString(), trips }))
    res.json({ deleted: true, trips })
  })

  // ---------------------------------------------------------------- outside APIs and spare keys
  router.get('/apis', async (_req, res) => {
    const [keys, planner] = await Promise.all([
      ApiKey.find().sort({ createdAt: 1 }),
      // Which keys the planner has in its own Vercel environment (yes/no only, never the key).
      fetch(`${config.aiUrl}/api/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null),
    ])
    const envSet = {
      serpapi: planner?.sources?.live_fares_and_hotels,
      openrouter: planner?.sources?.ai,
      geoapify: planner?.sources?.maps_and_places,
      aviationstack: planner?.sources?.flight_schedules,
    }
    res.json({
      ready: configured.apiKeys(),
      plannerReachable: !!planner,
      services: SERVICES.map((service) => ({
        ...service,
        envKey: {
          set: envSet[service.id] ?? null,
          status: keys.find((k) => k.service === service.id && k.source === 'env')?.toAdmin() ?? null,
        },
        keys: keys.filter((k) => k.service === service.id && k.source === 'admin').map((k) => ({ ...k.toAdmin(), readable: !!decrypt(k.secret) })),
      })),
      free: FREE_SERVICES,
    })
  })

  router.post('/apis/:service/keys', async (req, res) => {
    if (!configured.apiKeys()) throw new HttpError(503, 'Set INTERNAL_API_SECRET on the server and the planner first (see server/.env.example).')
    if (!serviceIds.includes(req.params.service)) throw new HttpError(404, 'Unknown service.')
    const body = parse(z.object({ key: z.string().trim().min(8, 'paste the whole key').max(400), label: z.string().trim().max(60).optional() }), req.body)
    if (await ApiKey.exists({ service: req.params.service, last4: body.key.slice(-4), source: 'admin' })) {
      const same = (await ApiKey.find({ service: req.params.service, source: 'admin' })).some((k) => decrypt(k.secret) === body.key)
      if (same) throw new HttpError(409, 'This key is already added.')
    }
    const check = await testKey(req.params.service, body.key)
    if (check.ok === false) throw new HttpError(400, `The key did not work: ${check.error}`)
    const key = await ApiKey.create({
      service: req.params.service,
      source: 'admin',
      label: body.label || '',
      secret: encrypt(body.key),
      last4: body.key.slice(-4),
      credits: check.credits ?? null,
      checkedAt: check.ok === null ? null : new Date(),
      lastError: check.error ?? '',
    })
    res.status(201).json({ key: key.toAdmin(), tested: check.ok !== null })
  })

  router.post('/apis/keys/:id/check', async (req, res) => {
    const key = await ApiKey.findById(objectId(req.params.id))
    if (!key || key.source !== 'admin') throw new HttpError(404, 'Key not found.')
    const secret = decrypt(key.secret)
    if (!secret) throw new HttpError(409, 'This key can no longer be read (the encryption secret changed). Remove it and add it again.')
    const check = await testKey(key.service, secret)
    if (check.ok === true) Object.assign(key, { status: 'active', lastError: '', exhaustedAt: null })
    if (check.ok === false) Object.assign(key, { status: /used up|no searches left|429/i.test(check.error ?? '') ? 'exhausted' : 'invalid', lastError: check.error ?? '' })
    if (check.credits) key.credits = check.credits
    key.checkedAt = new Date()
    await key.save()
    res.json({ key: key.toAdmin(), tested: check.ok !== null })
  })

  router.delete('/apis/keys/:id', async (req, res) => {
    const key = await ApiKey.findById(objectId(req.params.id))
    if (!key || key.source !== 'admin') throw new HttpError(404, 'Key not found.')
    await key.deleteOne()
    res.json({ deleted: true })
  })

  router.get('/trips/:id', async (req, res) => {
    const trip = await Trip.findById(objectId(req.params.id)).populate('user', 'fullName email photo').lean()
    if (!trip) throw new HttpError(404, 'Trip not found.')
    res.json({
      trip: {
        id: trip._id.toString(),
        title: trip.title,
        origin: trip.origin,
        destination: trip.destination,
        cities: trip.cities ?? [],
        startDate: trip.startDate,
        durationDays: trip.durationDays,
        travelers: trip.travelers,
        estimatedCost: trip.estimatedCost,
        currency: trip.currency,
        status: trip.status,
        favorite: !!trip.favorite,
        notes: trip.notes ?? '',
        share: { enabled: !!trip.share?.enabled, url: trip.share?.enabled && trip.share.id ? `${config.appUrl}/share/${trip.share.id}` : null },
        owner: trip.user ? { id: trip.user._id.toString(), fullName: trip.user.fullName, email: trip.user.email, photoUrl: trip.user.photo?.url || '' } : null,
        messages: (trip.messages ?? []).map((m) => ({ role: m.role, content: m.content, at: m.at })),
        versions: (trip.versions ?? []).map((v, i) => ({
          number: i + 1,
          prompt: v.prompt ?? '',
          estimatedCost: v.estimatedCost ?? v.plan?.estimated_cost ?? null,
          currency: v.currency ?? '',
          createdAt: v.createdAt,
          summary: v.plan?.trip_summary ?? '',
          days: (v.plan?.daily_itinerary ?? []).map((d) => ({
            day: d.day,
            city: d.city,
            title: d.title ?? d.theme ?? '',
            stops: (d.activities ?? []).filter((a) => !['meal', 'transfer', 'stay', 'travel'].includes(a.category)).map((a) => a.name),
          })),
        })),
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,
      },
    })
  })

  return router
}
