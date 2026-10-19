import { Globe2, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'

export function Header() {
  const reset = useStore((s) => s.reset)
  const busy = useStore((s) => s.status !== 'idle')
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
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
    <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-400 text-white shadow-sm">
            <Globe2 size={18} />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-slate-900 dark:text-white">WorldTour</div>
            <div className="hidden text-xs leading-tight text-slate-500 sm:block dark:text-slate-400">Multi-agent trip planner</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.confirm('Start a new trip? The current conversation and plan will be cleared.') && reset()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw size={15} /> <span className="hidden sm:inline">New trip</span>
          </button>
          <button
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </div>
    </header>
  )
}
