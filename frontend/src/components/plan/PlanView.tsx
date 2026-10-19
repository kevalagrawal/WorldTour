import clsx from 'clsx'
import { CalendarDays, LayoutDashboard, ListChecks, PieChart, Users } from 'lucide-react'
import { useState } from 'react'
import { formatLocal, formatMoney, prettyDate, type Display } from '../../lib/money'
import type { Plan } from '../../lib/types'
import { Badge, Stat } from '../ui'
import { BookExport } from './BookExport'
import { Costs } from './Costs'
import { DayByDay } from './DayByDay'
import { Overview } from './Overview'

const TABS = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
  { id: 'days', label: 'Day by day', icon: <CalendarDays size={15} /> },
  { id: 'costs', label: 'Costs', icon: <PieChart size={15} /> },
  { id: 'book', label: 'Book & export', icon: <ListChecks size={15} /> },
] as const
type Tab = (typeof TABS)[number]['id']

export function PlanView({ plan }: { plan: Plan }) {
  const [tab, setTab] = useState<Tab>('overview')
  const display: Display = { currency: plan.display_currency || 'USD', rate: plan.usd_to_display || 1 }
  const recommended = plan.packages.find((p) => p.name === plan.recommended_package)
  const budget = plan.budget
  const budgetText =
    budget.user_stated && budget.amount != null && (budget.currency || 'USD') === display.currency
      ? formatLocal(budget.amount, budget.currency) + (budget.scope === 'per_person' ? ' pp' : '')
      : formatMoney(budget.planning_budget, display)
  const dates = plan.dates.start_date
    ? `${prettyDate(plan.dates.start_date)} – ${prettyDate(plan.dates.end_date, true)}`
    : 'Dates flexible'

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-teal-600 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
          <span>{plan.origin || '—'} → {plan.destination || '—'}</span>
          {plan.cities.length > 1 && <span>· {plan.cities.join(', ')}</span>}
        </div>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{plan.trip_summary}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-2.5 py-0.5">{dates}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5">
            <Users size={13} /> {plan.travelers || 1}
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 capitalize">{plan.pace || 'balanced'} pace</span>
          {plan.preferences.map((p) => (
            <span key={p} className="rounded-full bg-white/15 px-2.5 py-0.5 capitalize">{p}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Estimated total" value={formatMoney(plan.estimated_cost, display)} hint={recommended ? `${recommended.label} package` : undefined} />
        <Stat label="Your budget" value={budgetText} />
        <Stat
          label={plan.remaining_budget != null && plan.remaining_budget < 0 ? 'Over budget' : 'Left over'}
          value={
            <span className={plan.remaining_budget != null && plan.remaining_budget < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
              {formatMoney(Math.abs(plan.remaining_budget ?? 0), display)}
            </span>
          }
        />
        <Stat label="Getting there" value={<span className="text-sm">{plan.transport_choice?.label ?? '—'}</span>} />
      </div>

      {plan.parser_notes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {plan.parser_notes.map((note) => (
            <Badge key={note} tone="slate">{note}</Badge>
          ))}
        </div>
      )}

      <div className="sticky top-14 z-[500] -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 backdrop-blur dark:bg-slate-900/90">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={clsx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === item.id
                ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
            )}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview plan={plan} display={display} />}
      {tab === 'days' && <DayByDay plan={plan} display={display} />}
      {tab === 'costs' && <Costs plan={plan} display={display} />}
      {tab === 'book' && <BookExport plan={plan} display={display} />}
    </div>
  )
}
