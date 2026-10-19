import clsx from 'clsx'
import type { ReactNode } from 'react'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border border-slate-200/80 bg-white shadow-soft dark:border-white/10 dark:bg-ink-800', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

const BADGE = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/30',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30',
  coral: 'bg-coral-50 text-coral-600 ring-coral-100 dark:bg-coral-500/15 dark:text-coral-400 dark:ring-coral-400/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10',
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof BADGE }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[tone])}>{children}</span>
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-soft dark:border-white/10 dark:bg-ink-800">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-display text-lg font-bold text-slate-900 sm:text-xl dark:text-white">{value}</div>
      {hint && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  )
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('font-medium text-brand-600 hover:underline dark:text-brand-300', className)}>
      {children}
    </a>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white shadow-lift">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-coral-500 dark:border-ink-900" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-white">WorldTour</div>
          <div className="hidden text-[11px] font-medium text-slate-500 sm:block dark:text-slate-400">AI trip planner</div>
        </div>
      )}
    </div>
  )
}
