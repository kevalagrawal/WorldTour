import clsx from 'clsx'
import {
  Activity, ArrowLeft, BarChart3, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, Globe2, Heart, Inbox, Layers, Loader2,
  Lock, LogOut, Mail, MapPin, Menu, MessageSquareText, Phone, RefreshCw, Search, Share2, ShieldCheck, Sparkles, StickyNote, UserRound, Users, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MessageContent } from '../components/MessageContent'
import { Logo } from '../components/ui'
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
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

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
  if (!response.ok) throw new AdminError(data?.error || `Request failed (${response.status}).`, response.status)
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

type View = { kind: 'overview' } | { kind: 'users' } | { kind: 'user'; id: string } | { kind: 'trip'; id: string; userId: string }
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
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => boxes.current[0]?.focus(), [])

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
      onUnlocked(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is not right.')
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
          <div key={shake} className={clsx('mt-6 flex justify-center gap-2', shake && 'animate-[shake_0.4s_ease-in-out]')}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el
                }}
                value={digit}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                aria-label={`Digit ${i + 1}`}
                disabled={busy}
                onChange={(e) => type(i, e.target.value)}
                onKeyDown={(e) => e.key === 'Backspace' && !digit && i > 0 && boxes.current[i - 1]?.focus()}
                className={clsx(
                  'h-12 w-10 rounded-xl border-2 bg-white text-center font-mono text-xl font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:h-14 sm:w-12 dark:bg-ink-900 dark:text-white',
                  error ? 'border-rose-300 dark:border-rose-400/50' : 'border-slate-200 dark:border-white/15',
                )}
              />
            ))}
          </div>
          {error && <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
          <button type="submit" disabled={busy || !digits.every(Boolean)} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50 dark:bg-brand-500">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Unlock dashboard
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400">Five wrong codes lock this page for 15 minutes.</p>
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

  useEffect(() => {
    const left = new Date(expiresAt).getTime() - Date.now()
    const timer = setTimeout(() => {
      toast.info('Admin session ended. Enter the code again.')
      onSignOut()
    }, Math.max(0, left))
    return () => clearTimeout(timer)
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

  const goto = (next: View) => {
    setView(next)
    setMenu(false)
    window.scrollTo({ top: 0 })
  }

  const nav: { id: string; label: string; icon: ReactNode; active: boolean; onClick: () => void; count?: number | null }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={18} />, active: view.kind === 'overview', onClick: () => goto({ kind: 'overview' }) },
    { id: 'users', label: 'All users', icon: <Inbox size={18} />, active: view.kind !== 'overview' && sort === 'recent', onClick: () => { setSort('recent'); goto({ kind: 'users' }) }, count: userCount },
    { id: 'active', label: 'Recently active', icon: <Activity size={18} />, active: view.kind !== 'overview' && sort === 'active', onClick: () => { setSort('active'); goto({ kind: 'users' }) } },
    { id: 'trips', label: 'Most trips', icon: <Globe2 size={18} />, active: view.kind !== 'overview' && sort === 'trips', onClick: () => { setSort('trips'); goto({ kind: 'users' }) } },
    { id: 'name', label: 'By name', icon: <UserRound size={18} />, active: view.kind !== 'overview' && sort === 'name', onClick: () => { setSort('name'); goto({ kind: 'users' }) } },
    { id: 'oldest', label: 'First sign-ups', icon: <CalendarDays size={18} />, active: view.kind !== 'overview' && sort === 'oldest', onClick: () => { setSort('oldest'); goto({ kind: 'users' }) } },
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
          <span className="hidden text-xs text-slate-500 xl:inline">Session until {new Date(expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={onSignOut} title="Lock dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10">
            <LogOut size={17} /> <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {menu && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMenu(false)} />}
        <aside className={clsx('fixed inset-y-0 left-0 z-30 w-64 shrink-0 bg-[#f6f8fc] pt-20 transition-transform lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 lg:pt-3 dark:bg-ink-900', menu ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}>
          <nav className="space-y-0.5 pr-3">
            {nav.map((item, i) => (
              <div key={item.id}>
                {i === 1 && <div className="px-6 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Users</div>}
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
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><ShieldCheck size={14} className="text-emerald-500" /> Read-only access</div>
            <p className="mt-1">Passwords are never stored here: Clerk keeps them. Nothing can be changed from this dashboard.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-6 pr-2 sm:pr-4 lg:pl-0">
          <div className="min-h-[calc(100dvh-5.5rem)] rounded-2xl bg-white shadow-soft dark:bg-ink-800">
            {view.kind === 'overview' && <OverviewView api={api} refresh={refresh} onOpenUser={(id) => goto({ kind: 'user', id })} />}
            {view.kind === 'users' && <UsersView api={api} refresh={refresh} sort={sort} query={query} onTotal={setUserCount} onOpen={(id) => goto({ kind: 'user', id })} />}
            {view.kind === 'user' && <UserView api={api} refresh={refresh} id={view.id} onBack={() => goto({ kind: 'users' })} onOpenTrip={(tripId) => goto({ kind: 'trip', id: tripId, userId: view.id })} />}
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

function UsersView({ api, refresh, sort, query, onTotal, onOpen }: { api: Api; refresh: number; sort: Sort; query: string; onTotal: (n: number) => void; onOpen: (id: string) => void }) {
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
        <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{query ? `Results for “${query}”` : { recent: 'All users · newest first', active: 'Recently active', trips: 'Most trips', name: 'By name', oldest: 'First sign-ups' }[sort]}</span>
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

function UserView({ api, refresh, id, onBack, onOpenTrip }: { api: Api; refresh: number; id: string; onBack: () => void; onOpenTrip: (id: string) => void }) {
  const { data, error } = useAdminData<{ user: AdminUser; trips: AdminTripRow[] }>(api, `/api/admin/users/${id}`, refresh)
  const user = data?.user
  const p = user?.preferences
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied.`)).catch(() => undefined)
  return (
    <>
      <Toolbar>
        <button onClick={onBack} aria-label="Back to users" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"><ArrowLeft size={18} /></button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">User details</span>
      </Toolbar>
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
