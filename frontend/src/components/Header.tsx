import clsx from 'clsx'
import { BookOpen, ChevronRight, Compass, History, Languages, LogIn, LogOut, Menu, Moon, Plus, RotateCcw, Settings, Sun, UserPlus, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ACCOUNTS_ENABLED, useAccount, useSession } from '../lib/account'
import { focusTripInput } from '../lib/focus'
import { LANGUAGES } from '../lib/i18n'
import { prettyDate } from '../lib/money'
import { setTheme, useDarkTheme } from '../lib/theme'
import { useStarted, useStore } from '../store'
import { ConfirmDialog, Logo } from './ui'
import { Avatar, UserMenu, useSignOut } from './UserMenu'

/** Always in the header, signed in or not, so it never appears and then disappears while the account loads. */
function ThemeToggle() {
  const dark = useDarkTheme()
  return (
    <button
      onClick={() => setTheme(!dark)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10"
    >
      <span key={dark ? 'sun' : 'moon'} className="animate-pop">{dark ? <Sun size={18} /> : <Moon size={18} />}</span>
    </button>
  )
}

const SECTIONS = [
  { id: 'destinations', label: 'Destinations' },
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'faq', label: 'FAQ' },
]

/** The home page section in view, for the active link. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const seen = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0)
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]
        setActive(best && best[1] > 0 ? best[0] : null)
      },
      { rootMargin: '-35% 0px -50% 0px', threshold: [0, 0.2, 0.5, 1] },
    )
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter((n): n is HTMLElement => !!n)
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [enabled])
  return enabled ? active : null
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

interface NavLink {
  label: string
  to?: string
  href?: string
  section?: string
  icon: ReactNode
  active: boolean
}

export function Header() {
  const hasConversation = useStarted()
  const location = useLocation()
  const navigate = useNavigate()
  const onHome = location.pathname === '/'
  // The planner layout (trip pill, wide header) only on the planner page.
  const started = hasConversation && onHome
  const landing = onHome && !hasConversation
  const { signedIn } = useSession()
  const accounts = ACCOUNTS_ENABLED && signedIn
  const { reset, status, summary, plan } = useStore()
  const busy = status !== 'idle'
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeConfirm = useCallback(() => setConfirming(false), [])
  const scrolled = useScrolled()
  const section = useActiveSection(landing)

  // The phone menu closes on every page change.
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }

  // New trip: confirm when there is a conversation to clear; otherwise go to an empty planner.
  const askNewTrip = () => {
    if (busy) return
    setMenuOpen(false)
    if (hasConversation) return setConfirming(true)
    if (!onHome) navigate('/')
    setTimeout(focusTripInput, 50)
  }
  const trip = plan
    ? `${plan.destination ?? 'Your trip'}${plan.duration.days ? ` · ${plan.duration.days} days` : ''}`
    : summary?.destination
      ? `${summary.destination}${summary.start_date ? ` · ${prettyDate(summary.start_date)}` : ''}`
      : null

  const links: NavLink[] = landing
    ? SECTIONS.map((s) => ({ label: s.label, href: `#${s.id}`, section: s.id, icon: <ChevronRight size={18} />, active: section === s.id }))
    : [
        { label: 'Plan a trip', to: '/', icon: <Compass size={18} />, active: onHome },
        ...(accounts ? [{ label: 'My trips', to: '/history', icon: <History size={18} />, active: location.pathname.startsWith('/history') || location.pathname.startsWith('/trips/') }] : []),
        { label: 'Travel guides', href: '/trip-planner', icon: <BookOpen size={18} />, active: false },
      ]

  const goTo = (link: NavLink) => {
    setMenuOpen(false)
    if (link.section) {
      document.getElementById(link.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      history.replaceState(null, '', `#${link.section}`)
    }
  }

  const primary = landing && !accounts ? (
    <a
      href="#plan"
      onClick={(event) => {
        event.preventDefault()
        setMenuOpen(false)
        focusTripInput()
      }}
      className="btn-shine inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-800 hover:shadow-lift active:translate-y-0 dark:bg-brand-500 dark:hover:bg-brand-400"
    >
      <span className="hidden min-[360px]:inline">Start planning</span>
      <span className="min-[360px]:hidden">Plan</span>
    </a>
  ) : (
    <button
      onClick={askNewTrip}
      disabled={busy}
      aria-label="New trip"
      className="btn-shine inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-800 hover:shadow-lift active:translate-y-0 disabled:opacity-40 sm:px-4 dark:bg-brand-500 dark:hover:bg-brand-400"
    >
      <Plus size={17} /> <span className="hidden sm:inline">New trip</span>
    </button>
  )

  return (
    <header
      className={clsx(
        'sticky top-0 z-[1000] border-b backdrop-blur-xl transition-[box-shadow,background-color] duration-300',
        scrolled || started
          ? 'border-slate-200/80 bg-white/90 shadow-[0_8px_24px_-18px_rgba(16,40,77,0.35)] dark:border-white/10 dark:bg-ink-900/90'
          : 'border-transparent bg-white/70 dark:bg-ink-900/70',
      )}
    >
      <div className={clsx('mx-auto flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6', started ? 'max-w-[110rem]' : 'max-w-7xl')}>
        <button onClick={() => (onHome ? started && askNewTrip() : navigate('/'))} className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20" aria-label={onHome && started ? 'WorldTour — start a new trip' : 'WorldTour home'}>
          <Logo />
        </button>

        {/* Centre: the trip being planned, or the site's links */}
        <div className="flex min-w-0 flex-1 justify-center">
          {started && trip ? (
            <div className="hidden min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-soft md:flex dark:border-white/10 dark:bg-ink-800">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', busy ? 'animate-pulse bg-amber-400' : plan ? 'bg-emerald-500' : 'bg-brand-500')} />
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{trip}</span>
              <span className="text-slate-400">·</span>
              <span className="shrink-0 text-slate-500">{busy ? (status === 'planning' ? 'Planning…' : 'Thinking…') : plan ? 'Plan ready' : 'Collecting details'}</span>
            </div>
          ) : (
            !started && (
              <nav className="hidden items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 p-1 shadow-soft md:flex dark:border-white/10 dark:bg-white/[0.03]" aria-label="Main">
                {links.map((link) => <DesktopLink key={link.label} link={link} onSection={goTo} />)}
              </nav>
            )
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="hidden md:block"><ThemeToggle /></div>
          {/* Guests: Sign in, then the main button. Signed in: the main button, then the avatar. */}
          {!accounts && <div className="hidden md:block"><UserMenu /></div>}
          {primary}
          {accounts && <div className="hidden md:block"><UserMenu /></div>}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition active:scale-95 md:hidden dark:border-white/10 dark:bg-ink-800 dark:text-slate-200"
          >
            {accounts ? <MiniAvatar open={menuOpen} /> : menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {menuOpen && <MobileMenu links={links} onLink={goTo} onClose={() => setMenuOpen(false)} />}

      <ConfirmDialog
        open={confirming}
        icon={<RotateCcw size={20} />}
        title="Start a new trip?"
        body={
          <>
            {plan ? (
              <>Your plan for <span className="font-semibold text-slate-800 dark:text-white">{plan.destination ?? 'this trip'}</span> and the conversation will be cleared from the planner.</>
            ) : (
              'The conversation so far will be cleared from the planner.'
            )}{' '}
            {ACCOUNTS_ENABLED && signedIn
              ? 'It stays saved in My trips, so you can open it again any time.'
              : ACCOUNTS_ENABLED
                ? 'Tip: sign in to save it to My trips, or download the PDF first.'
                : 'Tip: download the PDF first if you want to keep it.'}
          </>
        }
        confirmLabel="Start new trip"
        cancelLabel="Keep this trip"
        onCancel={closeConfirm}
        onConfirm={() => {
          setConfirming(false)
          reset()
          if (!onHome) navigate('/')
          window.scrollTo({ top: 0 })
          setTimeout(focusTripInput, 80)
        }}
      />
    </header>
  )
}

function DesktopLink({ link, onSection }: { link: NavLink; onSection: (link: NavLink) => void }) {
  const className = clsx(
    'relative inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors',
    link.active ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
  )
  if (link.to) return <Link to={link.to} className={className} aria-current={link.active ? 'page' : undefined}>{link.label}</Link>
  return (
    <a
      href={link.href}
      className={className}
      aria-current={link.active ? 'location' : undefined}
      onClick={(event) => {
        if (!link.section) return
        event.preventDefault()
        onSection(link)
      }}
    >
      {link.label}
    </a>
  )
}

function MiniAvatar({ open }: { open: boolean }) {
  return open ? <X size={19} /> : <Avatar size={30} className="ring-0" />
}

/** Phones and small tablets: everything in one sheet with large rows. */
function MobileMenu({ links, onLink, onClose }: { links: NavLink[]; onLink: (link: NavLink) => void; onClose: () => void }) {
  const { loaded, signedIn } = useSession()
  const profile = useAccount((s) => s.profile)
  const dark = useDarkTheme()
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const location = useLocation()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const row = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition active:scale-[0.99]'
  const idle = 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'
  const back = location.pathname === '/' ? '' : `?redirect=${encodeURIComponent(location.pathname)}`

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-16 z-[999] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 animate-[fade-in_0.15s_ease-out] bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-full animate-[slide-down_0.25s_ease-out] overflow-y-auto rounded-b-3xl border-b border-slate-200 bg-white px-4 pb-5 pt-3 shadow-2xl dark:border-white/10 dark:bg-ink-800">
        {ACCOUNTS_ENABLED && loaded && signedIn && (
          <Link to="/profile" className="mb-2 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
            <Avatar size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold text-slate-900 dark:text-white">{profile?.fullName || 'Your account'}</span>
              <span className="block truncate text-sm text-slate-500">{profile?.email}</span>
            </span>
            <ChevronRight size={18} className="text-slate-400" />
          </Link>
        )}

        <nav className="stagger space-y-0.5" aria-label="Main">
          {links.map((link) => {
            const cls = clsx(row, link.active ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-white' : idle)
            const inner = (
              <>
                <span className={clsx('grid h-9 w-9 place-items-center rounded-lg', link.active ? 'bg-brand-700 text-white dark:bg-brand-500' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300')}>{link.icon}</span>
                {link.label}
              </>
            )
            return link.to ? (
              <Link key={link.label} to={link.to} className={cls} onClick={onClose}>{inner}</Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className={cls}
                onClick={(event) => {
                  if (!link.section) return
                  event.preventDefault()
                  onLink(link)
                }}
              >
                {inner}
              </a>
            )
          })}
          {ACCOUNTS_ENABLED && loaded && signedIn && (
            <>
              <Link to="/profile" className={clsx(row, idle)}><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300"><UserRound size={18} /></span> Profile</Link>
              <Link to="/settings" className={clsx(row, idle)}><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300"><Settings size={18} /></span> Settings</Link>
            </>
          )}
        </nav>

        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-white/10">
          <button onClick={() => setTheme(!dark)} className={clsx(row, idle, 'justify-between')}>
            <span className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300">{dark ? <Sun size={18} /> : <Moon size={18} />}</span>
              {dark ? 'Light mode' : 'Dark mode'}
            </span>
            <span className={clsx('relative h-6 w-11 rounded-full transition', dark ? 'bg-brand-500' : 'bg-slate-300')}>
              <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', dark ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>
          <div className="px-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Languages size={14} /> Chat language</div>
            <div className="grid grid-cols-4 gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  aria-pressed={language === l.code}
                  className={clsx('h-11 rounded-xl text-sm font-semibold transition', language === l.code ? 'bg-brand-700 text-white dark:bg-brand-500' : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300')}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {ACCOUNTS_ENABLED && loaded && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
            {signedIn ? (
              <SignOutRow className={clsx(row, 'justify-center border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10')} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to={`/sign-in${back}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 text-[15px] font-semibold text-slate-800 dark:border-white/15 dark:text-white"><LogIn size={17} /> Sign in</Link>
                <Link to={`/sign-up${back}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 text-[15px] font-semibold text-white dark:bg-brand-500"><UserPlus size={17} /> Create account</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Separate component: useSignOut needs ClerkProvider, which exists only when accounts are on. */
function SignOutRow({ className }: { className: string }) {
  const signOut = useSignOut()
  return (
    <button onClick={signOut} className={className}>
      <LogOut size={18} /> Sign out
    </button>
  )
}
