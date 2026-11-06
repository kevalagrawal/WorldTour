import clsx from 'clsx'
import {
  Activity, ArrowLeft, BarChart3, ChevronLeft, ChevronRight, ClipboardList, Copy, ExternalLink, Eye, EyeOff, Globe2, Heart, Inbox, KeyRound, Layers, Loader2,
  Lock, LogOut, Mail, MapPin, Menu, MessageSquareText, Phone, Plus, RefreshCw, Search, Share2, ShieldCheck, Sparkles, StickyNote, Timer, Trash2, Users, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MessageContent } from '../components/MessageContent'
import { Select } from '../components/Select'
import { ConfirmDialog, Logo } from '../components/ui'
import { initials, SERVER_URL } from '../lib/account'
import { toast } from '../lib/toast'
import { INTERESTS, PARTIES, STYLES } from '../lib/travelProfile'
import { ago, money } from './common'

/**
 * Private admin dashboard (/admin). Opens only with the code set as ADMIN_CODE on the accounts
 * server; the code is checked there and never ships in this bundle. Read-only.
 */

// --------------------------------------------------------------------------- data

interface AdminUser {
  id: string
  clerkId: string
  fullName: string
  email: string
  phone: string
  photoUrl: string
  onboarded: boolean
  surveyDone: boolean
  preferences: {
    homeCity?: string
    currency?: string
    language?: string
    theme?: string
    readAloud?: boolean
    interests?: string[]
    travelParty?: string
    travelStyle?: string
  }
  createdAt: string
  updatedAt: string
  lastActiveAt: string
  trips: number
  lastTripAt?: string | null
  lastDestination?: string
}

interface AdminTripRow {
  id: string
  title: string
  origin: string
  destination: string
  cities: string[]
  startDate: string
  durationDays: number | null
  travelers: number | null
  estimatedCost: number | null
  currency: string
  status: string
  favorite: boolean
  shared: boolean
  versions: number
  prompts: number
  firstPrompt: string
  createdAt: string
  updatedAt: string
}

interface AdminTrip extends Omit<AdminTripRow, 'versions' | 'prompts' | 'firstPrompt' | 'shared'> {
  notes: string
  share: { enabled: boolean; url: string | null }
  owner: { id: string; fullName: string; email: string; photoUrl: string } | null
  messages: { role: 'user' | 'assistant'; content: string; at: string }[]
  versions: { number: number; prompt: string; estimatedCost: number | null; currency: string; createdAt: string; summary: string; days: { day: number; city: string; title: string; stops: string[] }[] }[]
}

interface Overview {
  totals: Record<'users' | 'activeThisWeek' | 'completedSurvey' | 'trips' | 'planned' | 'shared' | 'itineraries' | 'prompts', number>
  signups: { date: string; count: number }[]
  trips: { date: string; count: number }[]
  destinations: { name: string; trips: number }[]
  recentUsers: AdminUser[]
}

const SESSION_KEY = 'wt-admin-session'

function loadSession(): { token: string; expiresAt: string } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    return saved && new Date(saved.expiresAt) > new Date() ? saved : null
  } catch {
    return null
  }
}

class AdminError extends Error {
  readonly status: number
  readonly data: Record<string, unknown>
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
  }
}

/** What the server says about wrong codes: attempts used out of the maximum, and when a lock ends. */
interface Attempts {
  attempts: number
  maxAttempts: number
  remaining: number
  locked: boolean
  retryAt: string | null
}
const ATTEMPTS_KEY = 'wt-admin-attempts'

async function adminFetch<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(token ? { Authorization: `Admin ${token}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new AdminError("Couldn't reach the server. Check your connection.", 0)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new AdminError(data?.error || `Request failed (${response.status}).`, response.status, data ?? {})
  return data as T
}

const fullDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const shortDate = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// --------------------------------------------------------------------------- page

type View = { kind: 'overview' } | { kind: 'users' } | { kind: 'user'; id: string } | { kind: 'trip'; id: string; userId: string } | { kind: 'apis' }
type Sort = 'recent' | 'active' | 'trips' | 'name' | 'oldest'

export function AdminPage() {
  const [session, setSession] = useState(loadSession)

  useEffect(() => {
    // Keep this page out of search engines (the site's own robots tag says "index").
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const created = !meta
    meta ??= document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'robots' }))
    const previous = meta.content
    meta.content = 'noindex, nofollow'
    const title = document.title
    document.title = 'Admin · WorldTour'
    return () => {
      if (created) meta.remove()
      else meta.content = previous
      document.title = title
    }
  }, [])

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    setSession(null)
  }, [])

  if (!session) return <CodeGate onUnlocked={setSession} />
  return <Dashboard token={session.token} expiresAt={session.expiresAt} onSignOut={signOut} />
}

// --------------------------------------------------------------------------- code gate

function CodeGate({ onUnlocked }: { onUnlocked: (session: { token: string; expiresAt: string }) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [reveal, setReveal] = useState(false)
  const [tries, setTries] = useState<Attempts | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) || 'null') as Attempts | null
      // A finished lock is forgotten; the server is the judge either way.
      return saved && (!saved.retryAt || new Date(saved.retryAt) > new Date()) ? saved : null
    } catch {
      return null
    }
  })
  const [now, setNow] = useState(() => Date.now())
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const lockedFor = tries?.locked && tries.retryAt ? Math.max(0, new Date(tries.retryAt).getTime() - now) : 0
  const locked = lockedFor > 0

  useEffect(() => boxes.current[0]?.focus(), [])
  // Count down while locked; unlock the boxes when the time is up.
  useEffect(() => {
    if (!locked) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [locked])
  useEffect(() => {
    try {
      if (tries) sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(tries))
      else sessionStorage.removeItem(ATTEMPTS_KEY)
    } catch {
      /* only for showing the count after a reload */
    }
  }, [tries])

  const submit = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await adminFetch<{ token: string; expiresAt: string }>('/api/admin/session', null, { method: 'POST', body: { code } })
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
      } catch {
        /* the session lasts until the tab closes */
      }
      setTries(null)
      onUnlocked(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is not right.')
      if (e instanceof AdminError && typeof e.data.attempts === 'number') {
        setTries(e.data as unknown as Attempts)
        setNow(Date.now())
      }
      setShake((n) => n + 1)
      setDigits(Array(6).fill(''))
      setTimeout(() => boxes.current[0]?.focus(), 50)
    } finally {
      setBusy(false)
    }
  }

  const type = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    if (!clean) {
      setDigits((d) => d.map((x, i) => (i === index ? '' : x)))
      return
    }
    // Typing or pasting several digits fills the following boxes.
    const next = [...digits]
    clean.slice(0, 6 - index).split('').forEach((digit, offset) => (next[index + offset] = digit))
    setDigits(next)
    const filled = next.join('')
    if (filled.length === 6 && !next.includes('')) void submit(filled)
    else boxes.current[Math.min(5, index + clean.length)]?.focus()
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#f4f6f9] px-4 dark:bg-ink-900">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 animate-blob rounded-full bg-brand-200/60 blur-3xl dark:bg-brand-500/15" aria-hidden="true" />
      <div className="relative w-full max-w-sm animate-fade-up rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-lift dark:border-white/10 dark:bg-ink-800">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-lift dark:bg-brand-500">
          <Lock size={24} />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">WorldTour Admin</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter the 6-digit admin code to continue.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (digits.every(Boolean)) void submit(digits.join(''))
          }}
        >
          <div key={shake} className={clsx('relative mt-6 flex justify-center gap-2', shake && 'animate-[shake_0.4s_ease-in-out]')}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el
                }}
                value={digit}
                // Masked like a password; the code goes over HTTPS and is never stored.
                type={reveal ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                aria-label={`Digit ${i + 1}`}
                disabled={busy || locked}
                onChange={(e) => type(i, e.target.value)}
                onKeyDown={(e) => e.key === 'Backspace' && !digit && i > 0 && boxes.current[i - 1]?.focus()}
                className={clsx(
                  'h-12 w-10 rounded-xl border-2 bg-white text-center font-mono text-xl font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:h-14 sm:w-12 dark:bg-ink-900 dark:text-white',
                  error ? 'border-rose-300 dark:border-rose-400/50' : 'border-slate-200 dark:border-white/15',
                )}
              />
            ))}
          </div>
          <button type="button" onClick={() => setReveal(!reveal)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />} {reveal ? 'Hide code' : 'Show code'}
          </button>
          {error && !locked && <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
          {tries && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left dark:border-white/10 dark:bg-white/[0.03]" aria-live="polite">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-200">Wrong attempts</span>
                <span className={clsx('tabular-nums', tries.remaining <= 1 ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300')}>
                  {tries.attempts} of {tries.maxAttempts}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {Array.from({ length: tries.maxAttempts }, (_, i) => (
                  <span key={i} className={clsx('h-1.5 flex-1 rounded-full transition-colors', i < tries.attempts ? (tries.remaining <= 1 ? 'bg-rose-500' : 'bg-amber-500') : 'bg-slate-200 dark:bg-white/10')} />
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {locked
                  ? `Locked after ${tries.maxAttempts} wrong codes. Try again in ${Math.floor(lockedFor / 60000)}:${String(Math.floor((lockedFor % 60000) / 1000)).padStart(2, '0')}.`
                  : tries.remaining === 1
                    ? 'Last try before the page locks for 15 minutes.'
                    : `${tries.remaining} tries left before the page locks for 15 minutes.`}
              </p>
            </div>
          )}
          <button type="submit" disabled={busy || locked || !digits.every(Boolean)} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50 dark:bg-brand-500">
            {busy ? <Loader2 size={16} className="animate-spin" /> : locked ? <Lock size={16} /> : <ShieldCheck size={16} />} {locked ? 'Locked' : 'Unlock dashboard'}
          </button>
        </form>
        {!tries && <p className="mt-4 text-xs text-slate-400">Five wrong codes lock this page for 15 minutes.</p>}
      </div>
    </main>
  )
}

// --------------------------------------------------------------------------- dashboard shell

function Dashboard({ token, expiresAt, onSignOut }: { token: string; expiresAt: string; onSignOut: () => void }) {
  const [view, setView] = useState<View>({ kind: 'overview' })
  const [sort, setSort] = useState<Sort>('recent')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [userCount, setUserCount] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now())
  useEffect(() => {
    let warned = false
    const timer = setInterval(() => {
      const remaining = new Date(expiresAt).getTime() - Date.now()
      setLeft(remaining)
      if (remaining <= 60_000 && !warned) {
        warned = true
        toast.warning('The admin dashboard locks in 1 minute.')
      }
      if (remaining <= 0) {
        clearInterval(timer)
        toast.info('Locked after 5 minutes. Enter the code to continue.')
        onSignOut()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt, onSignOut])

  /** Calls that fail with 401 end the session. */
  const api = useCallback(
    async <T,>(path: string): Promise<T> => {
      try {
        return await adminFetch<T>(path, token)
      } catch (e) {
        if (e instanceof AdminError && e.status === 401) onSignOut()
        throw e
      }
    },
    [token, onSignOut],
  )
  const send = useCallback(
    async <T,>(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> => {
      try {
        return await adminFetch<T>(path, token, { method, body })
      } catch (e) {
        if (e instanceof AdminError && e.status === 401) onSignOut()
        throw e
      }
    },
    [token, onSignOut],
  )
  const remove = useCallback((path: string) => send<{ deleted: boolean; trips: number }>(path, 'DELETE'), [send])

  const goto = (next: View) => {
    setView(next)
    setMenu(false)
    window.scrollTo({ top: 0 })
  }

  const nav: { id: string; label: string; icon: ReactNode; active: boolean; onClick: () => void; count?: number | null }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={18} />, active: view.kind === 'overview', onClick: () => goto({ kind: 'overview' }) },
    { id: 'users', label: 'Users', icon: <Inbox size={18} />, active: ['users', 'user', 'trip'].includes(view.kind), onClick: () => goto({ kind: 'users' }), count: userCount },
    { id: 'apis', label: 'API keys', icon: <KeyRound size={18} />, active: view.kind === 'apis', onClick: () => goto({ kind: 'apis' }) },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-[#f6f8fc] text-slate-800 dark:bg-ink-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-slate-200/70 bg-[#f6f8fc]/95 px-3 backdrop-blur sm:gap-4 sm:px-4 dark:border-white/10 dark:bg-ink-900/95">
        <button onClick={() => setMenu(!menu)} aria-label="Menu" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"><Menu size={20} /></button>
        <div className="flex shrink-0 items-center gap-2 lg:w-56">
          <Logo compact />
          <span className="hidden font-display text-lg font-extrabold text-slate-900 sm:inline dark:text-white">WorldTour</span>
          <span className="rounded-md bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Admin</span>
        </div>
        <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full bg-[#e9eef6] px-4 transition focus-within:bg-white focus-within:shadow-lift md:max-w-2xl dark:bg-white/5 dark:focus-within:bg-ink-800">
          <Search size={18} className="shrink-0 text-slate-500" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (view.kind !== 'users') goto({ kind: 'users' })
            }}
            placeholder="Search users by name, email, phone or city"
            aria-label="Search users"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500"
          />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="text-slate-500 hover:text-slate-800 dark:hover:text-white"><X size={16} /></button>}
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setRefresh((n) => n + 1)} aria-label="Refresh" title="Refresh" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10"><RefreshCw size={18} /></button>
          <span
            title="The dashboard locks itself after 5 minutes"
            className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold tabular-nums', left <= 60_000 ? 'animate-pulse bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-200/60 text-slate-600 dark:bg-white/5 dark:text-slate-300')}
          >
            <Timer size={14} /> {Math.max(0, Math.floor(left / 60000))}:{String(Math.max(0, Math.floor((left % 60000) / 1000))).padStart(2, '0')}
          </span>
          <button onClick={onSignOut} title="Lock dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10">
            <LogOut size={17} /> <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {menu && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMenu(false)} />}
        <aside className={clsx('fixed inset-y-0 left-0 z-30 w-64 shrink-0 bg-[#f6f8fc] pt-20 transition-transform lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 lg:pt-3 dark:bg-ink-900', menu ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}>
          <nav className="space-y-0.5 pr-3">
            {nav.map((item) => (
              <div key={item.id}>
                <button
                  onClick={item.onClick}
                  className={clsx(
                    'flex h-9 w-full items-center gap-4 rounded-r-full pl-6 pr-4 text-sm transition',
                    item.active ? 'bg-brand-100 font-bold text-brand-900 dark:bg-brand-500/20 dark:text-white' : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/5',
                  )}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count != null && <span className="text-xs font-semibold">{item.count}</span>}
                </button>
              </div>
            ))}
          </nav>
          <div className="mx-6 mt-6 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-ink-800">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><ShieldCheck size={14} className="text-emerald-500" /> Admin access</div>
            <p className="mt-1">View every account and delete one when needed. Passwords are never stored here: Clerk keeps them.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-6 pr-2 sm:pr-4 lg:pl-0">
          <div className="min-h-[calc(100dvh-5.5rem)] rounded-2xl bg-white shadow-soft dark:bg-ink-800">
            {view.kind === 'overview' && <OverviewView api={api} refresh={refresh} onOpenUser={(id) => goto({ kind: 'user', id })} />}
            {view.kind === 'users' && <UsersView api={api} refresh={refresh} sort={sort} onSort={setSort} query={query} onTotal={setUserCount} onOpen={(id) => goto({ kind: 'user', id })} />}
            {view.kind === 'user' && (
              <UserView
                api={api}
                remove={remove}
                refresh={refresh}
                id={view.id}
                onBack={() => goto({ kind: 'users' })}
                onDeleted={() => {
                  setRefresh((n) => n + 1)
                  goto({ kind: 'users' })
                }}
                onOpenTrip={(tripId) => goto({ kind: 'trip', id: tripId, userId: view.id })}
              />
            )}
            {view.kind === 'apis' && <ApisView api={api} send={send} refresh={refresh} />}
            {view.kind === 'trip' && <TripView api={api} refresh={refresh} id={view.id} onBack={() => goto({ kind: 'user', id: view.userId })} />}
          </div>
        </main>
      </div>
    </div>
  )
}

type Api = <T>(path: string) => Promise<T>

function useAdminData<T>(api: Api, path: string, refresh: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    api<T>(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [api, path, refresh])
  return { data, error, loading }
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="sticky top-16 z-10 flex h-12 items-center gap-1 rounded-t-2xl border-b border-slate-100 bg-white/95 px-2 backdrop-blur sm:px-4 dark:border-white/10 dark:bg-ink-800/95">{children}</div>
}

function Failed({ children }: { children: ReactNode }) {
  return <div className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">{children}</div>
}

function Face({ user, size = 40 }: { user: { fullName: string; email: string; photoUrl: string }; size?: number }) {
  return user.photoUrl ? (
    <img src={user.photoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-700 font-bold text-white dark:bg-brand-500" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(user.fullName, user.email)}
    </span>
  )
}

// --------------------------------------------------------------------------- overview

function OverviewView({ api, refresh, onOpenUser }: { api: Api; refresh: number; onOpenUser: (id: string) => void }) {
  const { data, error } = useAdminData<Overview>(api, '/api/admin/overview', refresh)
  if (error) return <Failed>{error}</Failed>
  const t = data?.totals
  const tiles = [
    { label: 'Users', value: t?.users, icon: <Users size={18} />, tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' },
    { label: 'Active this week', value: t?.activeThisWeek, icon: <Activity size={18} />, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    { label: 'Travel profiles done', value: t?.completedSurvey, icon: <Sparkles size={18} />, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
    { label: 'Trips', value: t?.trips, icon: <Globe2 size={18} />, tone: 'bg-coral-50 text-coral-600 dark:bg-coral-500/15 dark:text-coral-400' },
    { label: 'Planned trips', value: t?.planned, icon: <ClipboardList size={18} />, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    { label: 'Itineraries generated', value: t?.itineraries, icon: <Layers size={18} />, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    { label: 'Prompts sent', value: t?.prompts, icon: <MessageSquareText size={18} />, tone: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
    { label: 'Shared links', value: t?.shared, icon: <Share2 size={18} />, tone: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  ]
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Overview</h1>
      <p className="text-sm text-slate-500">Everything stored in the WorldTour database, live.</p>
      <div className="stagger mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="lift rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <span className={clsx('grid h-9 w-9 place-items-center rounded-lg', tile.tone)}>{tile.icon}</span>
            <div className="mt-3 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{tile.value ?? <span className="skeleton inline-block h-7 w-12 rounded" />}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Chart title="Sign-ups, last 30 days" rows={data?.signups} tone="bg-brand-500" />
        <Chart title="Trips started, last 30 days" rows={data?.trips} tone="bg-coral-500" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Top destinations</h2>
          <div className="mt-3 space-y-2.5">
            {data?.destinations.length ? (
              data.destinations.map((d) => {
                const max = data.destinations[0].trips
                return (
                  <div key={d.name} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate font-medium">{d.name}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-700" style={{ width: `${(d.trips / max) * 100}%` }} /></span>
                    <span className="w-8 text-right font-semibold tabular-nums">{d.trips}</span>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-slate-500">{data ? 'No trips yet.' : 'Loading…'}</p>
            )}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Newest users</h2>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
            {(data?.recentUsers ?? []).map((user) => (
              <li key={user.id}>
                <button onClick={() => onOpenUser(user.id)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                  <Face user={user} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{user.fullName || 'No name'}</span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{ago(user.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Chart({ title, rows, tone }: { title: string; rows?: { date: string; count: number }[]; tone: string }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.count))
  const total = (rows ?? []).reduce((sum, r) => sum + r.count, 0)
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        <span className="text-sm font-semibold tabular-nums text-slate-500">{rows ? `${total} total` : ''}</span>
      </div>
      <div className="mt-4 flex h-36 items-end gap-[3px]">
        {(rows ?? Array.from({ length: 30 }, (_, i) => ({ date: String(i), count: 0 }))).map((r, i) => (
          <div key={r.date} className="group relative flex h-full flex-1 items-end">
            <div className={clsx('w-full rounded-t transition-all duration-700', rows ? (r.count ? tone : 'bg-slate-100 dark:bg-white/5') : 'skeleton')} style={{ height: rows ? `${Math.max(3, (r.count / max) * 100)}%` : '25%', transitionDelay: `${i * 15}ms` }} />
            {rows && (
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white group-hover:block">
                {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: {r.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{rows ? new Date(rows[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
        <span>Today</span>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- user list (the "inbox")

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Newest sign-ups' },
  { value: 'active', label: 'Recently active' },
  { value: 'trips', label: 'Most trips' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'oldest', label: 'Oldest sign-ups' },
]

function UsersView({ api, refresh, sort, onSort, query, onTotal, onOpen }: { api: Api; refresh: number; sort: Sort; onSort: (sort: Sort) => void; query: string; onTotal: (n: number) => void; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const limit = 30
  const path = useMemo(() => {
    const params = new URLSearchParams({ sort, page: String(page), limit: String(limit) })
    if (query) params.set('search', query)
    return `/api/admin/users?${params}`
  }, [sort, page, query])
  // A new search or sort starts on page 1.
  const [lastKey, setLastKey] = useState(`${sort}|${query}`)
  if (lastKey !== `${sort}|${query}`) {
    setLastKey(`${sort}|${query}`)
    setPage(1)
  }
  const { data, error, loading } = useAdminData<{ users: AdminUser[]; total: number; page: number; pages: number }>(api, path, refresh)
  useEffect(() => {
    if (data && !query) onTotal(data.total)
  }, [data, query, onTotal])

  const from = data ? (data.page - 1) * limit + 1 : 0
  const to = data ? Math.min(data.total, data.page * limit) : 0
  return (
    <>
      <Toolbar>
        <span className="truncate px-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{query ? `Results for “${query}”` : 'All users'}</span>
        <div className="w-40 shrink-0 sm:w-44">
          <Select size="sm" label="Sort users" value={sort} onChange={onSort} options={SORTS} />
        </div>
        {loading && <Loader2 size={15} className="animate-spin text-slate-400" />}
        <span className="ml-auto text-xs text-slate-500">{data?.total ? `${from}–${to} of ${data.total}` : ''}</span>
        <button disabled={!data || data.page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Newer" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/5"><ChevronLeft size={18} /></button>
        <button disabled={!data || data.page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Older" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/5"><ChevronRight size={18} /></button>
      </Toolbar>
      {error ? (
        <Failed>{error}</Failed>
      ) : !data ? (
        <div className="divide-y divide-slate-100 dark:divide-white/5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-3 px-4 py-3"><span className="skeleton h-9 w-9 rounded-full" /><span className="skeleton h-4 flex-1 rounded" /></div>)}</div>
      ) : !data.users.length ? (
        <div className="grid place-items-center py-24 text-center text-sm text-slate-500"><Inbox size={36} className="mb-2 text-slate-300" />No users match.</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {data.users.map((user) => (
            <li key={user.id}>
              <button onClick={() => onOpen(user.id)} className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:z-10 hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] sm:px-4 dark:hover:bg-white/[0.03] dark:hover:shadow-none">
                <Face user={user} size={36} />
                <span className="w-36 shrink-0 truncate text-sm font-bold text-slate-900 sm:w-48 dark:text-white">{user.fullName || 'No name'}</span>
                <span className="hidden min-w-0 flex-1 truncate text-sm md:block">
                  <span className="text-slate-700 dark:text-slate-200">{user.email}</span>
                  <span className="text-slate-500"> — {user.trips ? `${user.trips} trip${user.trips > 1 ? 's' : ''}${user.lastDestination ? `, latest ${user.lastDestination}` : ''}` : 'no trips yet'}{user.phone ? ` · ${user.phone}` : ''}{user.preferences.homeCity ? ` · ${user.preferences.homeCity}` : ''}</span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {user.trips > 0 && <span className="hidden rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 sm:inline dark:bg-brand-500/15 dark:text-brand-200">{user.trips} trips</span>}
                  {!user.surveyDone && <span className="hidden rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline dark:bg-amber-500/15 dark:text-amber-300">no profile</span>}
                  <span className="w-14 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">{shortDate(sort === 'active' ? user.lastActiveAt : user.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- one user

function UserView({ api, remove, refresh, id, onBack, onDeleted, onOpenTrip }: {
  api: Api
  remove: (path: string) => Promise<{ deleted: boolean; trips: number }>
  refresh: number
  id: string
  onBack: () => void
  onDeleted: () => void
  onOpenTrip: (id: string) => void
}) {
  const { data, error } = useAdminData<{ user: AdminUser; trips: AdminTripRow[] }>(api, `/api/admin/users/${id}`, refresh)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const user = data?.user
  // The account's email (or DELETE when it has none) must be typed to confirm.
  const confirmWord = user?.email || 'DELETE'
  const deleteAccount = async () => {
    if (!user || typed.trim().toLowerCase() !== confirmWord.toLowerCase() || deleting) return
    setDeleting(true)
    try {
      const result = await remove(`/api/admin/users/${user.id}`)
      toast.success(`${user.fullName || user.email} was deleted, with ${result.trips} trip${result.trips === 1 ? '' : 's'}.`)
      setConfirming(false)
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The account could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }
  const p = user?.preferences
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied.`)).catch(() => undefined)
  return (
    <>
      <Toolbar>
        <button onClick={onBack} aria-label="Back to users" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"><ArrowLeft size={18} /></button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">User details</span>
        {user && (
          <button onClick={() => { setTyped(''); setConfirming(true) }} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
            <Trash2 size={16} /> <span className="hidden sm:inline">Delete account</span>
          </button>
        )}
      </Toolbar>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        icon={<Trash2 size={20} />}
        title={`Delete ${user?.fullName || 'this account'}?`}
        focusConfirm={false}
        body={
          <>
            This permanently deletes their sign-in, profile photo, {data?.trips.length ?? 0} trip{data?.trips.length === 1 ? '' : 's'} with every prompt and itinerary, and shared links. It cannot be undone.
            <span className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-200">Type <span className="font-mono">{confirmWord}</span> to confirm</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void deleteAccount()}
              aria-label="Type the email to confirm"
              autoFocus
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/15 dark:border-white/15 dark:bg-ink-900 dark:text-white"
            />
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
        onCancel={() => !deleting && setConfirming(false)}
        onConfirm={() => void deleteAccount()}
      />
      {error ? (
        <Failed>{error}</Failed>
      ) : !user ? (
        <div className="p-6"><div className="skeleton h-24 rounded-xl" /></div>
      ) : (
        <div className="animate-fade-up p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Face user={user} size={72} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold text-slate-900 dark:text-white">{user.fullName || 'No name'}</h1>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                <button onClick={() => copy(user.email, 'Email')} className="inline-flex items-center gap-1.5 hover:text-brand-700 dark:hover:text-brand-300"><Mail size={14} /> {user.email || '—'}</button>
                {user.phone && <button onClick={() => copy(user.phone, 'Phone')} className="inline-flex items-center gap-1.5 hover:text-brand-700 dark:hover:text-brand-300"><Phone size={14} /> {user.phone}</button>}
                {p?.homeCity && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {p.homeCity}</span>}
              </div>
            </div>
            <div className="flex gap-2 text-center">
              <Mini label="Trips" value={data.trips.length} />
              <Mini label="Prompts" value={data.trips.reduce((s, t) => s + t.prompts, 0)} />
              <Mini label="Plans" value={data.trips.reduce((s, t) => s + t.versions, 0)} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="Account" icon={<ShieldCheck size={15} />}>
              <Row k="Joined" v={fullDate(user.createdAt)} />
              <Row k="Last active" v={`${fullDate(user.lastActiveAt)} (${ago(user.lastActiveAt)})`} />
              <Row k="Profile updated" v={fullDate(user.updatedAt)} />
              <Row k="Photo step" v={user.onboarded ? 'Done' : 'Not done'} />
              <Row k="Travel profile" v={user.surveyDone ? 'Answered' : 'Not answered'} />
              <Row k="Database ID" v={<Mono text={user.id} onCopy={() => copy(user.id, 'Database ID')} />} />
              <Row k="Clerk ID" v={<Mono text={user.clerkId} onCopy={() => copy(user.clerkId, 'Clerk ID')} />} />
            </Card>
            <Card title="Preferences and travel profile" icon={<Sparkles size={15} />}>
              <Row k="Interests" v={p?.interests?.length ? p.interests.map((i) => INTERESTS.find((x) => x.id === i)?.label ?? i).join(', ') : '—'} />
              <Row k="Travels" v={PARTIES.find((x) => x.id === p?.travelParty)?.label ?? '—'} />
              <Row k="Style" v={STYLES.find((x) => x.id === p?.travelStyle)?.label ?? '—'} />
              <Row k="Home city" v={p?.homeCity || '—'} />
              <Row k="Currency" v={p?.currency || 'Automatic'} />
              <Row k="Chat language" v={{ en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi' }[p?.language ?? 'en'] ?? p?.language} />
              <Row k="Theme · read aloud" v={`${p?.theme ?? 'system'} · ${p?.readAloud ? 'on' : 'off'}`} />
            </Card>
          </div>

          <h2 className="mb-2 mt-7 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Globe2 size={15} /> Trips ({data.trips.length})</h2>
          {data.trips.length ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
              {data.trips.map((trip) => (
                <li key={trip.id}>
                  <button onClick={() => onOpenTrip(trip.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 dark:hover:bg-white/5">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{trip.title}</span>
                        {trip.favorite && <Heart size={13} className="fill-rose-500 text-rose-500" />}
                        {trip.shared && <Badge tone="green">shared</Badge>}
                        <Badge tone={trip.status === 'planned' ? 'brand' : trip.status === 'archived' ? 'slate' : 'amber'}>{trip.status}</Badge>
                      </span>
                      <span className="block truncate text-sm text-slate-500">“{trip.firstPrompt || 'No prompt'}”</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
                      <span>{[trip.origin, trip.destination].filter(Boolean).join(' → ')}</span>
                      <span>{trip.versions} plan{trip.versions === 1 ? '' : 's'} · {trip.prompts} prompt{trip.prompts === 1 ? '' : 's'}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{money(trip.estimatedCost, trip.currency)}</span>
                      <span>{shortDate(trip.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/15">No trips yet.</p>
          )}
        </div>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- one trip (the "thread")

function TripView({ api, refresh, id, onBack }: { api: Api; refresh: number; id: string; onBack: () => void }) {
  const { data, error } = useAdminData<{ trip: AdminTrip }>(api, `/api/admin/trips/${id}`, refresh)
  const trip = data?.trip
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <Toolbar>
        <button onClick={onBack} aria-label="Back to user" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"><ArrowLeft size={18} /></button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Trip</span>
      </Toolbar>
      {error ? (
        <Failed>{error}</Failed>
      ) : !trip ? (
        <div className="p-6"><div className="skeleton h-24 rounded-xl" /></div>
      ) : (
        <div className="animate-fade-up p-4 sm:p-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{trip.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Badge tone={trip.status === 'planned' ? 'brand' : 'amber'}>{trip.status}</Badge>
            <span>{[trip.origin, trip.destination].filter(Boolean).join(' → ')}</span>
            {trip.durationDays && <span>· {trip.durationDays} days</span>}
            {trip.travelers && <span>· {trip.travelers} travelers</span>}
            <span>· {money(trip.estimatedCost, trip.currency)}</span>
            <span>· created {fullDate(trip.createdAt)}</span>
          </div>
          {trip.owner && (
            <div className="mt-3 flex items-center gap-2 text-sm"><Face user={trip.owner} size={24} /> <span className="font-semibold">{trip.owner.fullName}</span> <span className="text-slate-500">&lt;{trip.owner.email}&gt;</span></div>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><MessageSquareText size={15} /> Conversation ({trip.messages.length} messages)</h2>
              <ol className="space-y-2">
                {trip.messages.map((m, i) => (
                  <li key={i} className={clsx('rounded-xl border p-3 text-sm', m.role === 'user' ? 'border-brand-200 bg-brand-50/60 dark:border-brand-400/20 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10')}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{m.role === 'user' ? (trip.owner?.fullName || 'Traveler') : 'WorldTour assistant'}</span>
                      <span className="text-slate-500">{fullDate(m.at)}</span>
                    </div>
                    <div className="leading-relaxed text-slate-800 dark:text-slate-100">{m.role === 'user' ? m.content : <MessageContent text={m.content} />}</div>
                  </li>
                ))}
              </ol>
            </section>
            <aside className="space-y-4">
              <Card title={`Itinerary versions (${trip.versions.length})`} icon={<Layers size={15} />}>
                {trip.versions.length ? (
                  <ul className="space-y-2">
                    {[...trip.versions].reverse().map((v) => (
                      <li key={v.number} className="rounded-lg border border-slate-200 dark:border-white/10">
                        <button onClick={() => setOpen(open === v.number ? null : v.number)} className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm">
                          <span>
                            <span className="font-bold">Version {v.number}</span>
                            <span className="block text-xs text-slate-500">{fullDate(v.createdAt)}{v.prompt ? ` · “${v.prompt.slice(0, 40)}”` : ''}</span>
                          </span>
                          <span className="font-semibold tabular-nums">{money(v.estimatedCost, v.currency)}</span>
                        </button>
                        {open === v.number && (
                          <ol className="space-y-2 border-t border-slate-100 p-3 text-xs dark:border-white/10">
                            {v.days.map((d) => (
                              <li key={d.day}>
                                <div className="font-semibold text-slate-800 dark:text-slate-100">{d.title || `Day ${d.day}`}{d.city ? ` · ${d.city}` : ''}</div>
                                <div className="text-slate-500">{d.stops.join(' · ') || 'Travel only'}</div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No itinerary yet.</p>
                )}
              </Card>
              <Card title="Notes" icon={<StickyNote size={15} />}>
                <p className="whitespace-pre-wrap text-sm">{trip.notes || <span className="text-slate-500">No notes.</span>}</p>
              </Card>
              <Card title="Sharing" icon={<Share2 size={15} />}>
                {trip.share.enabled && trip.share.url ? (
                  <a href={trip.share.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">{trip.share.url}</a>
                ) : (
                  <p className="text-sm text-slate-500">Not shared.</p>
                )}
              </Card>
            </aside>
          </div>
        </div>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- bits

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">{icon} {title}</h2>
      {children}
    </section>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-white/5">
      <span className="w-32 shrink-0 text-slate-500">{k}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{v}</span>
    </div>
  )
}

function Mono({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <button onClick={onCopy} title="Copy" className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-slate-700 hover:text-brand-700 dark:text-slate-200">
      <span className="truncate">{text}</span> <Copy size={12} className="shrink-0" />
    </button>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'brand' | 'green' | 'amber' | 'slate'; children: ReactNode }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  }
  return <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize', tones[tone])}>{children}</span>
}

// --------------------------------------------------------------------------- outside APIs and keys

interface ApiKeyRow {
  id: string
  label: string
  masked: string
  status: 'active' | 'exhausted' | 'invalid'
  lastError: string
  exhaustedAt: string | null
  lastUsedAt: string | null
  credits: { remaining: number | null; limit: number | null; used?: number | null; unit: string; freeTier?: boolean } | null
  checkedAt: string | null
  createdAt: string
  readable?: boolean
}

interface ApiService {
  id: string
  name: string
  purpose: string
  envVar: string
  signup: string
  quota: string
  envKey: { set: boolean | null; status: ApiKeyRow | null }
  keys: ApiKeyRow[]
}

const KEY_STATUS: Record<ApiKeyRow['status'], { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  active: { label: 'Working', tone: 'green' },
  exhausted: { label: 'Used up', tone: 'amber' },
  invalid: { label: 'Rejected', tone: 'slate' },
}

function credits(c: ApiKeyRow['credits']): string {
  if (!c) return ''
  if (c.unit === 'searches') return c.remaining == null ? '' : `${c.remaining}${c.limit ? ` of ${c.limit}` : ''} searches left`
  if (c.unit === 'USD credit') return c.remaining == null ? (c.freeTier ? 'Free tier (no credit)' : 'No spending limit') : `$${Number(c.remaining).toFixed(2)} credit left`
  return ''
}

function ApisView({ api, send, refresh }: { api: Api; send: <T>(path: string, method: 'POST' | 'DELETE', body?: unknown) => Promise<T>; refresh: number }) {
  const [tick, setTick] = useState(0)
  const { data, error } = useAdminData<{ ready: boolean; plannerReachable: boolean; services: ApiService[]; free: { name: string; purpose: string }[] }>(api, '/api/admin/apis', refresh + tick * 1000)
  const reload = () => setTick((n) => n + 1)
  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const check = async (key: ApiKeyRow) => {
    setBusy(key.id)
    try {
      const { key: updated, tested } = await send<{ key: ApiKeyRow; tested: boolean }>(`/api/admin/apis/keys/${key.id}/check`, 'POST')
      toast[updated.status === 'active' ? 'success' : 'warning'](tested ? `Checked: ${KEY_STATUS[updated.status].label.toLowerCase()}${credits(updated.credits) ? ` · ${credits(updated.credits)}` : ''}.` : 'This service can only be checked by using it; the planner will report it.')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The check failed.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <Failed>{error}</Failed>
  return (
    <div className="p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900 dark:text-white"><KeyRound size={20} /> API keys</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Every outside service the planner uses. When a key's free quota runs out, add another one here: the planner switches to the next working key by itself, with no redeploy. Keys are stored encrypted and only the last 4 characters are ever shown.
      </p>
      {data && !data.ready && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
          Adding keys needs one setting first: set <b>INTERNAL_API_SECRET</b> (the same long random text) on both the server and the planner projects in Vercel, then redeploy both.
        </div>
      )}
      {!data ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-48 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="stagger mt-5 grid gap-4 xl:grid-cols-2">
            {data.services.map((service) => {
              const env = service.envKey
              const envUsedUp = env.status && env.status.status !== 'active'
              const working = (env.set && !envUsedUp ? 1 : 0) + service.keys.filter((k) => k.status === 'active').length
              return (
                <section key={service.id} className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <div className="flex items-start gap-3">
                    <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-sm font-extrabold', working ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300')}>
                      {service.name.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">{service.name}</h2>
                        <Badge tone={working ? 'green' : 'amber'}>{working ? `${working} working key${working > 1 ? 's' : ''}` : 'No working key'}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{service.purpose}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{service.quota} · <a href={service.signup} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand-700 hover:underline dark:text-brand-300">Get a key <ExternalLink size={11} /></a></p>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-2">
                    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Main key <span className="font-mono text-xs font-normal text-slate-500">{service.envVar}</span></span>
                        <span className="block text-xs text-slate-500">
                          {env.set === null ? (data.plannerReachable ? 'Unknown' : 'Planner not reachable') : env.set ? 'Set in the planner’s Vercel settings' : 'Not set in Vercel'}
                          {envUsedUp && env.status ? ` · ${env.status.status === 'exhausted' ? 'used up' : 'rejected'} ${ago(env.status.exhaustedAt)}` : ''}
                        </span>
                      </span>
                      {env.set === false ? <Badge tone="slate">Missing</Badge> : envUsedUp && env.status ? <Badge tone={KEY_STATUS[env.status.status].tone}>{KEY_STATUS[env.status.status].label}</Badge> : env.set ? <Badge tone="green">Working</Badge> : null}
                    </li>
                    {service.keys.map((key, i) => (
                      <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{key.label || `Spare key ${i + 1}`} <span className="font-mono text-xs font-normal text-slate-500">{key.masked}</span></span>
                          <span className="block text-xs text-slate-500">
                            Added {ago(key.createdAt)}
                            {credits(key.credits) ? ` · ${credits(key.credits)}` : ''}
                            {key.status !== 'active' && key.exhaustedAt ? ` · ${key.status === 'exhausted' ? 'used up' : 'rejected'} ${ago(key.exhaustedAt)}` : ''}
                            {key.readable === false ? ' · cannot be read any more: remove and add it again' : ''}
                          </span>
                          {key.lastError && key.status !== 'active' && <span className="block truncate text-xs text-rose-600 dark:text-rose-300" title={key.lastError}>{key.lastError}</span>}
                        </span>
                        <Badge tone={KEY_STATUS[key.status].tone}>{KEY_STATUS[key.status].label}</Badge>
                        <button onClick={() => void check(key)} disabled={busy === key.id} title="Check the key now" className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5">
                          {busy === key.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        </button>
                        <button onClick={() => setRemoving({ id: key.id, name: `${service.name} ${key.masked}` })} title="Remove the key" className="grid h-8 w-8 place-items-center rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {adding === service.id ? (
                    <AddKeyForm service={service} send={send} disabled={!data.ready} onDone={() => { setAdding(null); reload() }} onCancel={() => setAdding(null)} />
                  ) : (
                    <button onClick={() => setAdding(service.id)} disabled={!data.ready} className="mt-3 inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-dashed border-slate-300 px-3 text-sm font-semibold text-slate-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
                      <Plus size={15} /> Add a spare key
                    </button>
                  )}
                </section>
              )
            })}
          </div>
          <section className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Free services (no key needed)</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.free.map((free) => (
                <div key={free.name} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span><span className="font-semibold">{free.name}</span> <span className="text-slate-500">· {free.purpose}</span></span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={!!removing}
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Remove this key?"
        body={<>The planner stops using <b>{removing?.name}</b> within 5 minutes. The key itself stays valid at the provider.</>}
        confirmLabel="Remove key"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing!
          setRemoving(null)
          void send(`/api/admin/apis/keys/${target.id}`, 'DELETE')
            .then(() => {
              toast.success('Key removed.')
              reload()
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'The key could not be removed.'))
        }}
      />
    </div>
  )
}

function AddKeyForm({ service, send, disabled, onDone, onCancel }: { service: ApiService; send: <T>(path: string, method: 'POST' | 'DELETE', body?: unknown) => Promise<T>; disabled: boolean; onDone: () => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (key.trim().length < 8) return setError('Paste the whole key.')
    setBusy(true)
    setError(null)
    try {
      const { key: added, tested } = await send<{ key: ApiKeyRow; tested: boolean }>(`/api/admin/apis/${service.id}/keys`, 'POST', { key: key.trim(), label: label.trim() || undefined })
      toast.success(`${service.name} key added${tested ? ' and checked' : ''}${credits(added.credits) ? `: ${credits(added.credits)}` : ''}.`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The key could not be added.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="mt-3 animate-fade-up space-y-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-400/30 dark:bg-brand-500/10"
    >
      <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand-500 dark:border-white/15 dark:bg-ink-900">
        <KeyRound size={15} className="shrink-0 text-slate-400" />
        <input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder={`New ${service.name} key`} aria-label={`New ${service.name} key`} autoFocus className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Show key'} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Label (optional), e.g. Backup account" aria-label="Key label" className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/15 dark:bg-ink-900" />
      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
        <button type="submit" disabled={busy || disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 dark:bg-brand-500">
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? 'Checking…' : 'Check and add'}
        </button>
      </div>
    </form>
  )
}
