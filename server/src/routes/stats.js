import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import { Trip } from '../models/Trip.js'

/** GET /api/stats: numbers for the profile page. */
export function statsRoutes({ identity }) {
  const router = Router()
  router.use(requireUser(identity))
  router.get('/', async (req, res) => {
    const userId = req.user._id
    const [counts, places, spend, recent] = await Promise.all([
      Trip.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            trips: { $sum: 1 },
            planned: { $sum: { $cond: [{ $gt: [{ $size: '$versions' }, 0] }, 1, 0] } },
            favorites: { $sum: { $cond: ['$favorite', 1, 0] } },
            plansGenerated: { $sum: { $size: '$versions' } },
            prompts: { $sum: { $size: { $filter: { input: '$messages', cond: { $eq: ['$$this.role', 'user'] } } } } },
            days: { $sum: { $ifNull: ['$durationDays', 0] } },
          },
        },
      ]),
      Trip.aggregate([
        { $match: { user: userId, destination: { $nin: ['', null, 'Multi-city'] } } },
        { $group: { _id: '$destination', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Trip.aggregate([
        { $match: { user: userId, estimatedCost: { $ne: null }, currency: { $ne: '' } } },
        { $group: { _id: '$currency', amount: { $sum: '$estimatedCost' } } },
        { $sort: { amount: -1 } },
      ]),
      Trip.find({ user: userId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(4).select('-session -selection -versions.plan -messages.content -notes'),
    ])
    const totals = counts[0] ?? { trips: 0, planned: 0, favorites: 0, plansGenerated: 0, prompts: 0, days: 0 }
    res.json({
      stats: {
        trips: totals.trips,
        planned: totals.planned,
        favorites: totals.favorites,
        plansGenerated: totals.plansGenerated,
        prompts: totals.prompts,
        daysPlanned: totals.days,
        destinations: places.length,
        topDestination: places[0]?._id ?? null,
        budgetPlanned: spend.map((row) => ({ currency: row._id, amount: row.amount })),
      },
      recent: recent.map((t) => t.toSummary()),
    })
  })
  return router
}
