import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from '../config.js'

/**
 * The outside APIs the planner uses, and spare keys the admin can add for them.
 *
 * Keys added in the admin dashboard are stored encrypted (AES-256-GCM). The planner (ai/) reads them
 * through /api/internal/keys with the shared INTERNAL_API_SECRET, uses them after the key in its own
 * Vercel environment, and reports a key that ran out so the next one takes over.
 */

export const SERVICES = [
  {
    id: 'serpapi',
    name: 'SerpAPI',
    purpose: 'Live Google Flights fares and Google Hotels rates',
    envVar: 'SERPAPI_API_KEY',
    signup: 'https://serpapi.com/users/sign_up',
    quota: 'Free plan: 250 searches a month',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    purpose: 'The AI model: reading messages, hotel suggestions and day descriptions',
    envVar: 'OPENROUTER_API_KEY',
    signup: 'https://openrouter.ai/keys',
    quota: 'Free models: about 50 requests a day (1,000 with $10 credit)',
  },
  {
    id: 'geoapify',
    name: 'Geoapify',
    purpose: 'Attractions, hotel locations, maps and place lookup',
    envVar: 'GEOAPIFY_API_KEY',
    signup: 'https://myprojects.geoapify.com/register',
    quota: 'Free plan: 3,000 credits a day',
  },
  {
    id: 'aviationstack',
    name: 'Aviationstack',
    purpose: 'Flight schedules when SerpAPI has no fares',
    envVar: 'AVIATIONSTACK_API_KEY',
    signup: 'https://aviationstack.com/signup/free',
    quota: 'Free plan: 100 requests a month',
  },
]

// Free services with no key, shown so the admin sees everything the planner depends on.
export const FREE_SERVICES = [
  { name: 'Open-Meteo', purpose: 'Weather forecasts, climate and town lookup' },
  { name: 'OSRM', purpose: 'Road distances and driving times' },
  { name: 'Frankfurter', purpose: 'Currency exchange rates' },
  { name: 'Wikipedia', purpose: 'Landmarks and their descriptions' },
  { name: 'MyMemory', purpose: 'Chat translation (Hindi, Gujarati, Marathi)' },
]

export const serviceIds = SERVICES.map((s) => s.id)

// The encryption key comes from KEY_ENCRYPTION_SECRET (or INTERNAL_API_SECRET). Changing it makes
// stored keys unreadable; they then show as "re-add this key" in the dashboard.
const secretKey = () => createHash('sha256').update(`worldtour-api-keys:${config.keyEncryptionSecret}`).digest()

export function encrypt(text) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return { iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

export function decrypt(box) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(box.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Ask the provider whether a key works, without spending quota where possible.
 * Returns { ok, credits?: { remaining, limit, unit }, error? }; ok=null when the service can't be checked for free.
 */
export async function testKey(service, key, fetchImpl = fetch) {
  const get = async (url, init) => {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000) })
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }
  try {
    if (service === 'serpapi') {
      // The account endpoint is free and reports the searches left.
      const { status, body } = await get(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`)
      if (status !== 200 || body.error) return { ok: false, error: body.error || `SerpAPI answered ${status}` }
      const left = body.total_searches_left ?? body.plan_searches_left
      return { ok: left !== 0, credits: { remaining: left ?? null, limit: body.searches_per_month ?? null, unit: 'searches' }, error: left === 0 ? 'No searches left this month' : undefined }
    }
    if (service === 'openrouter') {
      const { status, body } = await get('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } })
      if (status !== 200) return { ok: false, error: body?.error?.message || `OpenRouter answered ${status}` }
      const d = body.data ?? {}
      return { ok: true, credits: { remaining: d.limit_remaining ?? null, limit: d.limit ?? null, used: d.usage ?? null, unit: 'USD credit', freeTier: !!d.is_free_tier } }
    }
    if (service === 'geoapify') {
      const { status, body } = await get(`https://api.geoapify.com/v1/geocode/search?text=Delhi&limit=1&format=json&apiKey=${encodeURIComponent(key)}`)
      if (status === 401 || status === 403) return { ok: false, error: body?.message || 'Geoapify rejected the key' }
      if (status === 429) return { ok: false, error: 'Daily credits used up' }
      return { ok: status === 200 }
    }
    return { ok: null } // Aviationstack: every call uses quota, so the key is checked on first use
  } catch (error) {
    return { ok: null, error: `Could not reach ${service}: ${error?.name === 'TimeoutError' ? 'timed out' : error?.message}` }
  }
}
