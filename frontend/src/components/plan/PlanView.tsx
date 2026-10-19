import clsx from 'clsx'
import { CalendarDays, Check, Copy, LayoutDashboard, ListChecks, Luggage, PieChart, PiggyBank, Printer, Users, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { exportText } from '../../lib/api'
import { formatLocal, formatMoney, prettyDate, type Display } from '../../lib/money'
import type { Plan } from '../../lib/types'
import { Stat } from '../ui'
import { BookExport } from './BookExport'
import { Costs } from './Costs'
import { DayByDay } from './DayByDay'
import { Overview } from './Overview'

const TABS = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
  { id: 'days', label: 'Itinerary', icon: <CalendarDays size={16} /> },
  { id: 'costs', label: 'Costs', icon: <PieChart size={16} /> },
  { id: 'book', label: 'Book & export', icon: <ListChecks size={16} /> },
] as const
type Tab = (typeof TABS)[number]['id']

export function PlanView({ plan }: { plan: Plan }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [copied, setCopied] = useState(false)
  const display: Display = { currency: plan.display_currency || 'USD', rate: plan.usd_to_display || 1 }
  const recommended = plan.packages.find((p) => p.name === plan.recommended_package)
  const budget = plan.budget
  const budgetText =
    budget.user_stated && budget.amount != null && (budget.currency || 'USD') === display.currency
      ? formatLocal(budget.amount, budget.currency) + (budget.scope === 'per_person' ? ' pp' : '')
      : formatMoney(budget.planning_budget, display)
  const dates = plan.dates.start_date ? `${prettyDate(plan.dates.start_date)} – ${prettyDate(plan.dates.end_date, true)}` : 'Flexible dates'
  const over = plan.remaining_budget != null && plan.remaining_budget < 0

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(await exportText(plan))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be blocked; the download buttons still work */
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 p-5 text-white shadow-lift sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-coral-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white/75">
              <span>{plan.origin || '—'}</span>
              <span>→</span>
              <span>{plan.destination || '—'}</span>
              {plan.cities.length > 1 && <span className="text-white/60">· {plan.cities.join(', ')}</span>}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl lg:text-4xl">{plan.trip_summary}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Pill>{dates}</Pill>
              <Pill><Users size={13} /> {plan.travelers || 1} traveler{(plan.travelers || 1) > 1 ? 's' : ''}</Pill>
              <Pill className="capitalize">{plan.pace || 'balanced'} pace</Pill>
              {plan.preferences.map((p) => <Pill key={p} className="capitalize">{p}</Pill>)}
            </div>
          </div>
          <div className="no-print flex gap-2">
            <button onClick={() => void copySummary()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25">
              {copied ? <Check size={15} /> : <Copy size={15} />} <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy summary'}</span>
            </button>
            <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25">
              <Printer size={15} /> <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Wallet size={13} />} label="Estimated total" value={formatMoney(plan.estimated_cost, display)} hint={recommended ? `${recommended.label} package` : undefined} />
        <Stat icon={<PiggyBank size={13} />} label="Your budget" value={budgetText} hint={recommended?.fits_budget === false ? 'Over budget' : 'Fits the plan'} />
        <Stat
          icon={<Wallet size={13} />}
          label={over ? 'Over budget by' : 'Left to spend'}
          value={<span className={over ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>{formatMoney(Math.abs(plan.remaining_budget ?? 0), display)}</span>}
          hint={over ? 'Try the Budget package' : 'Shopping, tips & surprises'}
        />
        <Stat icon={<Luggage size={13} />} label="Getting there" value={<span className="text-[15px]">{plan.transport_choice?.label ?? '—'}</span>} hint={plan.transport_choice?.price_is_estimate ? 'Estimated fare' : plan.transport_choice ? 'Live fare' : undefined} />
      </div>

      {plan.parser_notes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">Good to know: </span>
          {plan.parser_notes.join(' ')}
        </div>
      )}

      <div className="no-print sticky top-16 z-[500] -mx-1 bg-slate-50/90 px-1 py-2 backdrop-blur dark:bg-ink-900/90">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1 shadow-soft dark:border-white/10 dark:bg-ink-800">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={clsx(
                'inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition',
                tab === item.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
              )}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview plan={plan} display={display} />}
      {tab === 'days' && <DayByDay plan={plan} display={display} />}
      {tab === 'costs' && <Costs plan={plan} display={display} />}
      {tab === 'book' && <BookExport plan={plan} display={display} />}
    </div>
  )
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-medium backdrop-blur', className)}>{children}</span>
}
