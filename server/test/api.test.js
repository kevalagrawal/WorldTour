// End-to-end tests of the API against an in-memory MongoDB, with stand-ins for Clerk and Cloudinary.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server-core'
import request from 'supertest'

const WEBHOOK_SECRET = 'whsec_' + Buffer.from('worldtour-test-webhook-secret-123456').toString('base64')
let mongo, app, calls, photos, Webhook, disconnect

const PROFILES = {
  user_alice: { firstName: 'Alice', lastName: 'Sharma', emailAddresses: [{ id: 'e1', emailAddress: 'Alice@Example.com' }], primaryEmailAddressId: 'e1', unsafeMetadata: { phone: '+91 98765 43210' } },
  user_bob: { firstName: 'Bob', lastName: '', emailAddresses: [{ id: 'e2', emailAddress: 'bob@example.com' }], primaryEmailAddressId: 'e2', unsafeMetadata: {} },
}

before(async () => {
  // A real database can be used instead of the in-memory one: TEST_MONGODB_URI=mongodb+srv://.../worldtour-test
  if (process.env.TEST_MONGODB_URI) {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI
  } else {
    mongo = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongo.getUri('worldtour-test')
  }
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET
  process.env.CLOUDINARY_FOLDER = 'worldtour/avatars'
  process.env.APP_URL = 'https://worldtour-xi.vercel.app'
  process.env.ADMIN_CODE = 'test-admin-246810'
  process.env.INTERNAL_API_SECRET = 'test-internal-secret-0123456789'
  process.env.AI_URL = 'http://127.0.0.1:9' // nothing listens: the planner counts as unreachable
  ;({ Webhook } = await import('svix'))
  const { createApp } = await import('../src/app.js')
  ;({ disconnectDatabase: disconnect } = await import('../src/db.js'))
  calls = { updateUser: [], deleteUser: [], destroyed: [] }
  const identity = {
    enabled: true,
    middleware: (_req, _res, next) => next(),
    userId: (req) => req.get('x-test-user') || null,
    getUser: async (id) => PROFILES[id] ?? null,
    updateUser: async (id, data) => calls.updateUser.push({ id, data }),
    deleteUser: async (id) => calls.deleteUser.push(id),
  }
  photos = {
    enabled: true,
    sign: (clerkId) => ({ uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload', publicId: `worldtour/avatars/${clerkId}-1700000000`, signature: 'sig', timestamp: 1700000000, apiKey: 'k', cloudName: 'demo' }),
    destroy: async (publicId) => publicId && calls.destroyed.push(publicId),
    ownsUrl: (url, publicId) => url.startsWith('https://res.cloudinary.com/demo/image/upload/') && url.includes(publicId),
  }
  app = createApp({ identity, photos })
})

after(async () => {
  if (process.env.TEST_MONGODB_URI) {
    const mongoose = (await import('mongoose')).default
    await mongoose.connection.db?.dropDatabase().catch(() => undefined)
  }
  await disconnect?.()
  await mongo?.stop()
})

const as = (user) => ({
  get: (path) => request(app).get(path).set('x-test-user', user),
  post: (path) => request(app).post(path).set('x-test-user', user),
  put: (path) => request(app).put(path).set('x-test-user', user),
  patch: (path) => request(app).patch(path).set('x-test-user', user),
  delete: (path) => request(app).delete(path).set('x-test-user', user),
})
const alice = as('user_alice')
const bob = as('user_bob')

const plan = (cost, destination = 'Goa') => ({
  trip_summary: `Plan for ${destination}, 4 days`,
  origin: 'Mumbai',
  destination,
  cities: [],
  duration: { days: 4, nights: 3 },
  dates: { start_date: '2026-12-12', end_date: '2026-12-15' },
  travelers: 2,
  estimated_cost: cost,
  usd_to_display: 85,
  display_currency: 'INR',
  daily_itinerary: [],
})
const conversation = [
  { role: 'user', content: 'goa frm mumbai 4day 2ppl 40k', at: '2026-10-24T10:00:00Z' },
  { role: 'assistant', content: 'Great, I have everything I need.', at: '2026-10-24T10:00:01Z' },
]

describe('accounts', () => {
  test('health reports configuration without keys', async () => {
    const res = await request(app).get('/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.database, 'connected')
    assert.equal(res.body.clerkWebhook, true)
    assert.ok(!JSON.stringify(res.body).includes(WEBHOOK_SECRET))
  })

  test('signed-in routes need a user', async () => {
    const res = await request(app).get('/api/me')
    assert.equal(res.status, 401)
    assert.match(res.body.error, /sign in/i)
  })

  test('first request creates the profile from Clerk, phone included', async () => {
    const res = await alice.get('/api/me')
    assert.equal(res.status, 200)
    assert.equal(res.body.user.fullName, 'Alice Sharma')
    assert.equal(res.body.user.email, 'alice@example.com')
    assert.equal(res.body.user.phone, '+91 98765 43210')
    assert.equal(res.body.user.onboarded, false)
    assert.equal(res.body.user.preferences.language, 'en')
  })

  test('settings: validation, update, and the name is copied to Clerk', async () => {
    const bad = await alice.patch('/api/me').send({ phone: 'call me' })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /phone/)
    const res = await alice
      .patch('/api/me')
      .send({ fullName: 'Alice R Sharma', phone: '+91 90000 11111', preferences: { homeCity: 'Pune', currency: 'inr', language: 'gu', theme: 'dark', readAloud: true } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.user.preferences, { homeCity: 'Pune', currency: 'INR', language: 'gu', theme: 'dark', readAloud: true, interests: [], travelParty: '', travelStyle: '' })
    assert.deepEqual(calls.updateUser.at(-1), { id: 'user_alice', data: { firstName: 'Alice', lastName: 'R Sharma' } })
  })

  test('photo: signed upload, only your own photo is accepted, old photo is removed', async () => {
    const sign = await alice.post('/api/me/photo/sign')
    assert.equal(sign.status, 200)
    const theirs = await alice.patch('/api/me/photo').send({ publicId: 'worldtour/avatars/user_bob-1', url: 'https://res.cloudinary.com/demo/image/upload/v1/worldtour/avatars/user_bob-1.jpg' })
    assert.equal(theirs.status, 400)
    const first = await alice.patch('/api/me/photo').send({ publicId: 'worldtour/avatars/user_alice-1', url: 'https://res.cloudinary.com/demo/image/upload/v1/worldtour/avatars/user_alice-1.jpg' })
    assert.equal(first.status, 200)
    assert.match(first.body.user.photoUrl, /c_fill,g_face,w_256,h_256/)
    assert.equal(first.body.user.onboarded, true)
    await alice.patch('/api/me/photo').send({ publicId: 'worldtour/avatars/user_alice-2', url: 'https://res.cloudinary.com/demo/image/upload/v2/worldtour/avatars/user_alice-2.jpg' })
    assert.ok(calls.destroyed.includes('worldtour/avatars/user_alice-1'))
  })
})

describe('trips', () => {
  let tripId

  test('a conversation is saved before any plan exists', async () => {
    const res = await alice.post('/api/trips').send({ messages: conversation, session: { stage: 'ready', request: { origin: 'Mumbai', destination: 'Goa', duration_days: 4 } } })
    assert.equal(res.status, 201)
    tripId = res.body.trip.id
    assert.equal(res.body.trip.status, 'planning')
    assert.equal(res.body.trip.title, 'Goa · 4 days')
    assert.equal(res.body.trip.firstPrompt, 'goa frm mumbai 4day 2ppl 40k')
  })

  test('each new plan is a version; the same plan twice is not', async () => {
    let res = await alice.put(`/api/trips/${tripId}/sync`).send({ messages: conversation, plan: plan(400) })
    assert.equal(res.body.trip.versions, 1)
    assert.equal(res.body.trip.estimatedCost, 34000)
    res = await alice.put(`/api/trips/${tripId}/sync`).send({ messages: conversation, plan: plan(400) })
    assert.equal(res.body.trip.versions, 1)
    const more = [...conversation, { role: 'user', content: 'premium' }, { role: 'assistant', content: 'Updating the plan.' }]
    res = await alice.put(`/api/trips/${tripId}/sync`).send({ messages: more, plan: plan(700), selection: { package: 'premium' } })
    assert.equal(res.body.trip.versions, 2)
    assert.equal(res.body.trip.status, 'planned')
    const detail = await alice.get(`/api/trips/${tripId}`)
    assert.equal(detail.body.trip.messages.length, 4)
    assert.equal(detail.body.trip.versionList[1].prompt, 'premium')
    assert.equal(detail.body.trip.plan.estimated_cost, 700)
    assert.deepEqual(detail.body.trip.selection, { package: 'premium' })
    const first = await alice.get(`/api/trips/${tripId}/versions/${detail.body.trip.versionList[0].id}`)
    assert.equal(first.body.version.plan.estimated_cost, 400)
  })

  test('history: list, search, favourite, rename', async () => {
    await alice.post('/api/trips').send({ messages: [{ role: 'user', content: 'Jaipur from Delhi 3 days' }], plan: plan(300, 'Jaipur') })
    let res = await alice.get('/api/trips')
    assert.equal(res.body.total, 2)
    assert.equal(res.body.trips[0].destination, 'Jaipur')
    res = await alice.get('/api/trips?search=goa')
    assert.deepEqual(res.body.trips.map((t) => t.destination), ['Goa'])
    await alice.patch(`/api/trips/${tripId}`).send({ favorite: true, title: 'Anniversary in Goa' })
    res = await alice.get('/api/trips?favorite=true')
    assert.equal(res.body.trips[0].title, 'Anniversary in Goa')
    res = await alice.put(`/api/trips/${tripId}/sync`).send({ plan: plan(710) })
    assert.equal(res.body.trip.title, 'Anniversary in Goa')
  })

  test('another user cannot see or change the trip', async () => {
    assert.equal((await bob.get(`/api/trips/${tripId}`)).status, 404)
    assert.equal((await bob.put(`/api/trips/${tripId}/sync`).send({ plan: plan(1) })).status, 404)
    assert.equal((await bob.delete(`/api/trips/${tripId}`)).status, 404)
    assert.equal((await bob.get('/api/trips')).body.total, 0)
    assert.equal((await alice.get('/api/trips/not-an-id')).status, 404)
  })

  test('sharing: a public read-only link that can be turned off', async () => {
    const before = await alice.get(`/api/trips/${tripId}/share`)
    assert.deepEqual(before.body.share, { enabled: false, url: null, canShare: true })
    assert.equal((await bob.get(`/api/trips/${tripId}/share`)).status, 404)
    const on = await alice.post(`/api/trips/${tripId}/share`)
    assert.equal(on.status, 200)
    assert.equal((await alice.get(`/api/trips/${tripId}/share`)).body.share.url, on.body.share.url)
    const shareId = on.body.share.url.split('/share/')[1]
    let pub = await request(app).get(`/api/share/${shareId}`)
    assert.equal(pub.status, 200)
    assert.equal(pub.body.trip.sharedBy, 'Alice')
    assert.equal(pub.body.trip.plan.estimated_cost, 710)
    assert.equal(pub.body.trip.messages, undefined)
    await alice.delete(`/api/trips/${tripId}/share`)
    pub = await request(app).get(`/api/share/${shareId}`)
    assert.equal(pub.status, 404)
    // Sharing again brings back the same link, so links sent earlier work again.
    assert.equal((await alice.post(`/api/trips/${tripId}/share`)).body.share.url, on.body.share.url)
    await alice.delete(`/api/trips/${tripId}/share`)
  })

  test('stats for the profile page', async () => {
    const res = await alice.get('/api/stats')
    assert.equal(res.body.stats.trips, 2)
    assert.equal(res.body.stats.planned, 2)
    assert.equal(res.body.stats.favorites, 1)
    assert.equal(res.body.stats.plansGenerated, 4)
    assert.equal(res.body.stats.destinations, 2)
    assert.deepEqual(res.body.stats.budgetPlanned, [{ currency: 'INR', amount: Math.round(710 * 85) + 300 * 85 }])
    assert.equal(res.body.stats.shared, 0)
    assert.equal(res.body.stats.places.length, 2)
    assert.equal(res.body.stats.activity.length, 6)
    assert.equal(res.body.stats.activity.at(-1).trips, 2)
  })
})

describe('sign-up questions', () => {
  test('interests, travel party and style are saved with the survey flag', async () => {
    const alice = as('user_alice')
    const bad = await alice.patch('/api/me').send({ preferences: { interests: ['skydiving'] } })
    assert.equal(bad.status, 400)
    const res = await alice.patch('/api/me').send({ surveyDone: true, preferences: { interests: ['beaches', 'food'], travelParty: 'couple', travelStyle: 'premium' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.user.surveyDone, true)
    assert.deepEqual(res.body.user.preferences.interests, ['beaches', 'food'])
    assert.equal(res.body.user.preferences.travelParty, 'couple')
    assert.equal(res.body.user.preferences.travelStyle, 'premium')
  })
})

describe('admin dashboard', () => {
  let token
  const admin = (path) => request(app).get(path).set('Authorization', `Admin ${token}`)

  test('the right code opens a session; nothing works without it', async () => {
    assert.equal((await request(app).get('/api/admin/overview')).status, 401)
    const ok = await request(app).post('/api/admin/session').send({ code: 'test-admin-246810' })
    assert.equal(ok.status, 200)
    token = ok.body.token
    assert.ok(new Date(ok.body.expiresAt) > new Date())
    // The dashboard locks itself after 5 minutes.
    assert.ok(new Date(ok.body.expiresAt) - Date.now() <= 5 * 60 * 1000 + 1000)
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1e9 })).toString('base64url')
    assert.equal((await request(app).get('/api/admin/overview').set('Authorization', `Admin ${forged}.${signature}`)).status, 401)
    assert.ok(payload)
  })

  test('overview, user list with search, one user and one trip', async () => {
    const overview = await admin('/api/admin/overview')
    assert.equal(overview.status, 200)
    assert.equal(overview.body.totals.users, 2)
    assert.equal(overview.body.totals.trips, 2)
    assert.equal(overview.body.signups.length, 30)
    const list = await admin('/api/admin/users?search=alice')
    assert.equal(list.body.total, 1)
    assert.equal(list.body.users[0].trips, 2)
    const user = await admin(`/api/admin/users/${list.body.users[0].id}`)
    assert.equal(user.body.user.email, 'alice@example.com')
    assert.equal(user.body.trips.length, 2)
    const trip = await admin(`/api/admin/trips/${user.body.trips[0].id}`)
    assert.equal(trip.status, 200)
    assert.ok(trip.body.trip.messages.length > 0)
    assert.ok(trip.body.trip.versions.length > 0)
    assert.equal((await admin('/api/admin/users/not-an-id')).status, 404)
  })

  test('deleting a user removes the sign-in, photo, trips and profile', async () => {
    const before = calls.deleteUser.length
    await as('user_bob').get('/api/me')
    const bob = (await admin('/api/admin/users?search=bob')).body.users[0]
    assert.ok(bob)
    assert.equal((await request(app).delete(`/api/admin/users/${bob.id}`)).status, 401)
    const res = await request(app).delete(`/api/admin/users/${bob.id}`).set('Authorization', `Admin ${token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.deleted, true)
    assert.deepEqual(calls.deleteUser.slice(before), ['user_bob'])
    assert.equal((await admin(`/api/admin/users/${bob.id}`)).status, 404)
    assert.equal((await request(app).delete(`/api/admin/users/${bob.id}`).set('Authorization', `Admin ${token}`)).status, 404)
  })

  test('spare API keys: stored encrypted, shown masked, read by the planner, reported, removed', async () => {
    const add = (service, body) => request(app).post(`/api/admin/apis/${service}/keys`).set('Authorization', `Admin ${token}`).send(body)
    assert.equal((await add('nope', { key: 'abcdefgh1234' })).status, 404)
    assert.equal((await add('aviationstack', { key: 'short' })).status, 400)
    const created = await add('aviationstack', { key: 'av-test-key-0000-9876', label: 'Backup 1' })
    assert.equal(created.status, 201)
    assert.equal(created.body.key.masked, '••••••••9876')
    assert.equal((await add('aviationstack', { key: 'av-test-key-0000-9876' })).status, 409)

    // Never stored in plain text.
    const mongoose = (await import('mongoose')).default
    const raw = await mongoose.connection.db.collection('apikeys').findOne({ last4: '9876' })
    assert.ok(raw.secret.data && !JSON.stringify(raw).includes('av-test-key-0000-9876'))

    const list = await admin('/api/admin/apis')
    const av = list.body.services.find((s) => s.id === 'aviationstack')
    assert.equal(av.keys.length, 1)
    assert.equal(av.keys[0].readable, true)
    assert.ok(!JSON.stringify(list.body).includes('av-test-key-0000-9876'))
    assert.equal(list.body.plannerReachable, false)

    const internal = (path) => request(app).get(path)
    assert.equal((await internal('/api/internal/keys')).status, 401)
    assert.equal((await internal('/api/internal/keys').set('x-internal-secret', 'wrong-secret-0123456789')).status, 401)
    const keys = await internal('/api/internal/keys').set('x-internal-secret', 'test-internal-secret-0123456789')
    assert.equal(keys.body.keys.aviationstack[0].key, 'av-test-key-0000-9876')

    const id = created.body.key.id
    const report = (body) => request(app).post('/api/internal/keys/report').set('x-internal-secret', 'test-internal-secret-0123456789').send(body)
    assert.equal((await report({ service: 'aviationstack', id, status: 'exhausted', error: 'usage limit reached' })).status, 200)
    assert.equal((await report({ service: 'serpapi', id: 'env', last4: 'ab12', status: 'exhausted', error: 'out of searches' })).status, 200)
    const after = (await admin('/api/admin/apis')).body.services
    assert.equal(after.find((s) => s.id === 'aviationstack').keys[0].status, 'exhausted')
    assert.equal(after.find((s) => s.id === 'serpapi').envKey.status.status, 'exhausted')

    assert.equal((await request(app).delete(`/api/admin/apis/keys/${id}`).set('Authorization', `Admin ${token}`)).status, 200)
    assert.equal((await admin('/api/admin/apis')).body.services.find((s) => s.id === 'aviationstack').keys.length, 0)
  })

  test('wrong codes are refused and locked out after 5 tries', async () => {
    const replies = []
    for (let i = 0; i < 6; i++) replies.push(await request(app).post('/api/admin/session').send({ code: `000000${i}` }))
    assert.deepEqual(replies.map((r) => r.status), [401, 401, 401, 401, 401, 429])
    assert.deepEqual(replies.map((r) => r.body.attempts), [1, 2, 3, 4, 5, 5])
    assert.deepEqual(replies.map((r) => r.body.remaining), [4, 3, 2, 1, 0, 0])
    assert.equal(replies[4].body.locked, true)
    assert.ok(replies[5].body.retryAt)
  })
})

describe('clerk webhook and account deletion', () => {
  const signed = (event) => {
    const payload = JSON.stringify(event)
    const id = `msg_${Math.random().toString(36).slice(2)}`
    const timestamp = new Date()
    const signature = new Webhook(WEBHOOK_SECRET).sign(id, timestamp, payload)
    return request(app)
      .post('/api/webhooks/clerk')
      .set('content-type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', String(Math.floor(timestamp.getTime() / 1000)))
      .set('svix-signature', signature)
      .send(payload)
  }

  test('a forged webhook is refused', async () => {
    const res = await request(app).post('/api/webhooks/clerk').set('content-type', 'application/json').send({ type: 'user.deleted', data: { id: 'user_alice' } })
    assert.equal(res.status, 400)
    assert.equal((await alice.get('/api/me')).status, 200)
  })

  test('user.created makes the profile with the sign-up phone number', async () => {
    const res = await signed({ type: 'user.created', data: { id: 'user_carol', first_name: 'Carol', last_name: 'Patel', email_addresses: [{ id: 'e3', email_address: 'carol@example.com' }], primary_email_address_id: 'e3', unsafe_metadata: { phone: '+91 91111 22222' } } })
    assert.equal(res.status, 200)
    const me = await as('user_carol').get('/api/me')
    assert.equal(me.body.user.fullName, 'Carol Patel')
    assert.equal(me.body.user.phone, '+91 91111 22222')
  })

  test('deleting the account removes trips, photo and the Clerk user', async () => {
    const res = await alice.delete('/api/me')
    assert.equal(res.status, 200)
    assert.ok(calls.deleteUser.includes('user_alice'))
    assert.ok(calls.destroyed.includes('worldtour/avatars/user_alice-2'))
    const { Trip } = await import('../src/models/Trip.js')
    assert.equal(await Trip.countDocuments({}), 0)
  })
})
