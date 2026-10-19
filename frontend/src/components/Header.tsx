import clsx from 'clsx'
import { Moon, Plus, Sun } from 'lucide-react'
import { useState } from 'react'
import { prettyDate } from '../lib/money'
import { useStarted, useStore } from '../store'
import { Logo } from './ui'

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('wt-theme', next ? 'dark' : 'light')
    } catch {
      /* theme still applies for this visit */
    }
  }
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

export function Header() {
  const started = useStarted()
  const { reset, status, summary, plan } = useStore()
  const busy = status !== 'idle'
  const trip = plan
    ? `${plan.destination ?? 'Your trip'}${plan.duration.days ? ` · ${plan.duration.days} days` : ''}`
    : summary?.destination
      ? `${summary.destination}${summary.start_date ? ` · ${prettyDate(summary.start_date)}` : ''}`
      : null

  return (
    <header
      className={clsx(
        'sticky top-0 z-[1000] border-b backdrop-blur-xl',
        started
          ? 'border-slate-200/80 bg-white/85 dark:border-white/10 dark:bg-ink-900/85'
          : 'border-transparent bg-white/60 dark:bg-ink-900/60',
      )}
    >
      <div className={clsx('mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6', started ? 'max-w-[1600px]' : 'max-w-7xl')}>
        <button onClick={() => started && !busy && window.confirm('Start a new trip? Your current conversation and plan will be cleared.') && reset()} className="shrink-0">
          <Logo />
        </button>

        {started && trip && (
          <div className="hidden min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm md:flex dark:border-white/10 dark:bg-ink-800">
            <span className={clsx('h-2 w-2 shrink-0 rounded-full', busy ? 'animate-pulse bg-amber-400' : plan ? 'bg-emerald-500' : 'bg-brand-500')} />
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{trip}</span>
            <span className="text-slate-400">·</span>
            <span className="shrink-0 text-slate-500">{busy ? (status === 'planning' ? 'Planning…' : 'Thinking…') : plan ? 'Plan ready' : 'Collecting details'}</span>
          </div>
        )}

        {!started && (
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex dark:text-slate-300">
            <a href="#destinations" className="hover:text-slate-900 dark:hover:text-white">Destinations</a>
            <a href="#how" className="hover:text-slate-900 dark:hover:text-white">How it works</a>
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a>
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {started && (
            <button
              onClick={() => window.confirm('Start a new trip? Your current conversation and plan will be cleared.') && reset()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-ink-800 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Plus size={16} /> <span className="hidden sm:inline">New trip</span>
            </button>
          )}
          <ThemeToggle />
          {!started && (
            <a
              href="#plan"
              className="ml-1 hidden h-9 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 sm:inline-flex dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Start planning
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
