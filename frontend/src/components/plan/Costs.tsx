import { PieChart as PieIcon } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fillMoney, formatMoney, type Display } from '../../lib/money'
import type { Plan } from '../../lib/types'
import { Card, SectionTitle } from '../ui'

const COLORS = ['#1d5ef1', '#0d9488', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']

export function Costs({ plan, display }: { plan: Plan; display: Display }) {
  const rows = plan.budget_breakdown
  const data = rows.filter((row) => row.cost > 0).map((row) => ({ name: row.category, value: row.cost }))
  const budget = plan.budget.planning_budget
  const used = budget ? Math.min(100, (plan.estimated_cost / budget) * 100) : null
  const recommended = plan.packages.find((p) => p.name === plan.recommended_package)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="p-4 lg:col-span-3">
        <SectionTitle icon={<PieIcon size={18} />} title={`Cost estimate${recommended ? ` — ${recommended.label} package` : ''}`} subtitle="Planning estimates in your currency" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, index) => (
            <div key={row.category} className="flex items-start gap-3 py-2.5">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white">{row.category}</div>
                {row.detail && <div className="text-xs text-slate-500">{fillMoney(row.detail, display)}</div>}
                {row.legs?.map((leg) => (
                  <div key={`${leg.from}-${leg.to}`} className="text-xs text-slate-500">
                    {leg.from} → {leg.to}: {leg.distance_km} km by {leg.mode}, {formatMoney(leg.cost, display)}
                  </div>
                ))}
              </div>
              <div className="text-sm font-semibold tabular-nums">{formatMoney(row.cost, display)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <div className="text-sm font-bold">Total</div>
            <div className="text-lg font-bold">{formatMoney(plan.estimated_cost, display)}</div>
          </div>
        </div>
        {used != null && (
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{Math.round((plan.estimated_cost / (budget || 1)) * 100)}% of your budget</span>
              <span>
                {plan.remaining_budget != null && plan.remaining_budget >= 0
                  ? `${formatMoney(plan.remaining_budget, display)} left for shopping and surprises`
                  : `${formatMoney(Math.abs(plan.remaining_budget ?? 0), display)} over budget`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={used >= 100 ? 'h-full bg-rose-500' : used > 85 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'}
                style={{ width: `${used}%` }}
              />
            </div>
          </div>
        )}
      </Card>
      <Card className="p-4 lg:col-span-2">
        <SectionTitle title="Where the money goes" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[rows.findIndex((row) => row.category === entry.name) % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(Number(value), display)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 space-y-1">
          {plan.packages.map((pkg) => (
            <div key={pkg.name} className="flex justify-between text-sm">
              <span className={pkg.name === plan.recommended_package ? 'font-semibold' : 'text-slate-500'}>{pkg.label}</span>
              <span className={pkg.fits_budget ? 'tabular-nums' : 'tabular-nums text-rose-500'}>{formatMoney(pkg.total, display)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
