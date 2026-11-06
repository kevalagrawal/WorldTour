import { createHash, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { config, configured } from '../config.js'
import { connectDatabase } from '../db.js'
import { decrypt, serviceIds } from '../lib/apiKeys.js'
import { HttpError, parse } from '../middleware/errors.js'
import { ApiKey } from '../models/ApiKey.js'

/**
 * Server-to-server only (the planner in ai/), protected by INTERNAL_API_SECRET in both projects.
 *
 *   GET  /api/internal/keys          spare keys per service (decrypted) and the status of each key
 *   POST /api/internal/keys/report   { service, id | "env", last4, status: exhausted | invalid | ok, error }
 */
const report = z.object({
  service: z.enum(serviceIds),
  id: z.string().max(40),
  last4: z.string().max(8).optional(),
  status: z.enum(['exhausted', 'invalid', 'ok']),
  error: z.string().max(300).optional(),
})

function same(a, b) {
  const x = createHash('sha256').update(String(a)).digest()
  const y = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(x, y)
}

export function internalRoutes() {
  const router = Router()
  router.use(async (req, _res, next) => {
    try {
      if (!configured.apiKeys()) throw new HttpError(503, 'INTERNAL_API_SECRET is not set.')
      if (!same(req.get('x-internal-secret') || '', config.internalSecret)) throw new HttpError(401, 'Not allowed.')
      await connectDatabase()
      next()
    } catch (error) {
      next(error)
    }
  })

  router.get('/keys', async (_req, res) => {
    const keys = await ApiKey.find().sort({ createdAt: 1 })
    const out = Object.fromEntries(serviceIds.map((id) => [id, []]))
    const env = {}
    for (const key of keys) {
      if (key.source === 'env') {
        env[key.service] = { last4: key.last4, status: key.status, exhaustedAt: key.exhaustedAt }
        continue
      }
      const secret = decrypt(key.secret)
      if (secret) out[key.service]?.push({ id: key._id.toString(), key: secret, status: key.status, exhaustedAt: key.exhaustedAt })
    }
    res.set('Cache-Control', 'no-store').json({ keys: out, env })
  })

  router.post('/keys/report', async (req, res) => {
    const body = parse(report, req.body)
    const update =
      body.status === 'ok'
        ? { status: 'active', lastError: '', exhaustedAt: null, lastUsedAt: new Date() }
        : { status: body.status, lastError: body.error ?? '', exhaustedAt: new Date() }
    if (body.id === 'env') {
      await ApiKey.findOneAndUpdate({ service: body.service, source: 'env' }, { $set: { ...update, last4: body.last4 ?? '' } }, { upsert: true })
    } else if (/^[a-f0-9]{24}$/.test(body.id)) {
      await ApiKey.updateOne({ _id: body.id, source: 'admin' }, { $set: update })
    }
    res.json({ recorded: true })
  })

  return router
}
