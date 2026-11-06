import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { z } from 'zod'
import { config } from '../config.js'
import { connectDatabase } from '../db.js'
import { HttpError, parse } from '../middleware/errors.js'
import { Trip } from '../models/Trip.js'
import { User } from '../models/User.js'

/**
 * The private admin dashboard's API (read-only).
 *
 *   POST /api/admin/session   { code }  → { token, expiresAt }   (code = ADMIN_CODE on the server)
 *   GET  /api/admin/overview            totals, sign-ups and trips per day, top destinations
 *   GET  /api/admin/users               search, sort, page
 *   GET  /api/admin/users/:id           everything about one user, with their trips
 *   GET  /api/admin/trips/:id           one trip: conversation, every itinerary version, notes, sharing
 *
 * The code never reaches the browser bundle. A correct code returns a signed pass valid for 2 hours
 * (header "Authorization: Admin <token>"); changing ADMIN_CODE invalidates every pass. Wrong codes are
 * limited to 5 per 15 minutes per address, so the 6-digit code cannot be guessed by brute force.
 */

const SESSION_MS = 2 * 60 * 60 * 1000
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

export function adminRoutes() {
  const router = Router()

  router.post(
    '/session',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many wrong codes. Try again in 15 minutes.' } }),
    (req, res) => {
      if (!config.adminCode) throw new HttpError(503, 'The admin dashboard is switched off (ADMIN_CODE is not set).')
      const { code } = parse(codeBody, req.body)
      if (!sameText(code, config.adminCode)) throw new HttpError(401, 'That code is not right.')
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
    const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    since.setHours(0, 0, 0, 0)
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
