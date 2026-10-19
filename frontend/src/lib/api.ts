import type { AgentEvent, ChatResponse, Plan, Session } from './types'

// In production VITE_API_URL is the backend's address (e.g. https://worldtour-api.vercel.app).
// In development it is empty and Vite proxies /api to the local Python server.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function headers(accessCode: string | null): HeadersInit {
  return { 'Content-Type': 'application/json', ...(accessCode ? { 'X-Access-Code': accessCode } : {}) }
}

async function fail(response: Response): Promise<never> {
  let detail = `Request failed (${response.status})`
  try {
    const body = await response.json()
    if (body?.detail) detail = String(body.detail)
  } catch {
    /* keep the generic message */
  }
  throw new ApiError(detail, response.status)
}

export async function health(): Promise<{ status: string; access_code_required: boolean }> {
  const response = await fetch(`${BASE}/api/health`)
  if (!response.ok) await fail(response)
  return response.json()
}

export async function sendChat(session: Session | null, message: string, accessCode: string | null): Promise<ChatResponse> {
  const response = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: headers(accessCode),
    body: JSON.stringify({ session, message }),
  })
  if (!response.ok) await fail(response)
  return response.json()
}

/** Runs the workflow. Progress events arrive one per line (NDJSON) while the plan is built. */
export async function runPlan(
  session: Session,
  accessCode: string | null,
  onEvent: (event: AgentEvent) => void,
): Promise<{ plan: Plan; session: Session }> {
  const response = await fetch(`${BASE}/api/plan`, {
    method: 'POST',
    headers: headers(accessCode),
    body: JSON.stringify({ session }),
  })
  if (!response.ok || !response.body) await fail(response)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: { plan: Plan; session: Session } | null = null
  const handle = (line: string) => {
    if (!line.trim()) return
    const message = JSON.parse(line)
    if (message.type === 'event') onEvent(message.event)
    else if (message.type === 'plan') result = { plan: message.plan, session: message.session }
    else if (message.type === 'error') throw new ApiError(message.message, 500)
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handle)
  }
  handle(buffer)
  if (!result) throw new ApiError('The planner stopped before finishing. Please try again.', 500)
  return result
}

export async function downloadExport(kind: 'text' | 'ics', plan: Plan): Promise<void> {
  const response = await fetch(`${BASE}/api/export/${kind}`, {
    method: 'POST',
    headers: headers(null),
    body: JSON.stringify({ plan }),
  })
  if (!response.ok) await fail(response)
  const blob = await response.blob()
  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')
  const name = match?.[1] ?? `worldtour-trip.${kind === 'ics' ? 'ics' : 'txt'}`
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}
