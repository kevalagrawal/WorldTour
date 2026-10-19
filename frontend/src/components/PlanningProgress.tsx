import clsx from 'clsx'
import { BedDouble, Calculator, CalendarClock, CheckCircle2, CircleDashed, CloudSun, Compass, Loader2, MapPinned, Plane, Route, ShieldCheck, TrainFront, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentEvent } from '../lib/types'
import { useStore } from '../store'
import { Card } from './ui'

const STEPS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'CONSTRAINT_VALIDATOR', label: 'Checking constraints', icon: <ShieldCheck size={16} /> },
  { id: 'FLIGHT_AGENT', label: 'Live flight fares', icon: <Plane size={16} /> },
  { id: 'TRANSPORT_AGENT', label: 'Trains, buses & cabs', icon: <TrainFront size={16} /> },
  { id: 'HOTEL_AGENT', label: 'Hotels for your dates', icon: <BedDouble size={16} /> },
  { id: 'WEATHER_AGENT', label: 'Weather', icon: <CloudSun size={16} /> },
  { id: 'RECOMMENDATION_AGENT', label: 'Places to visit', icon: <MapPinned size={16} /> },
  { id: 'ROUTE_AGENT', label: 'Road distances & routes', icon: <Route size={16} /> },
  { id: 'BUDGET_AGENT', label: 'Packages & budget', icon: <Calculator size={16} /> },
  { id: 'ITINERARY_AGENT', label: 'Hour-by-hour itinerary', icon: <CalendarClock size={16} /> },
]

type StepState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'

function stepStates(events: AgentEvent[]): Record<string, { state: StepState; message?: string }> {
  const result: Record<string, { state: StepState; message?: string }> = {}
  const required = events.find((e) => e.agent_id === 'COORDINATOR_AGENT' && e.message.startsWith('Required agents:'))
  const needed = required ? required.message.replace('Required agents:', '').split(',').map((s) => s.trim()) : null
  for (const step of STEPS) {
    const own = events.filter((e) => e.agent_id === step.id)
    const last = own[own.length - 1]
    if (needed && step.id.endsWith('_AGENT') && !needed.includes(step.id)) result[step.id] = { state: 'skipped' }
    else if (!last) result[step.id] = { state: 'waiting' }
    else if (own.some((e) => e.event === 'AGENT_FAILED')) result[step.id] = { state: 'failed', message: last.message }
    else if (last.event === 'AGENT_COMPLETED' || last.event === 'CONSTRAINT_VIOLATION') result[step.id] = { state: 'done', message: last.message }
    else result[step.id] = { state: 'running', message: last.message }
  }
  return result
}

export function PlanningProgress() {
  const events = useStore((s) => s.events)
  const states = stepStates(events)
  const visible = STEPS.filter((step) => states[step.id].state !== 'skipped')
  const done = visible.filter((step) => ['done', 'failed'].includes(states[step.id].state)).length

  return (
    <div className="mx-auto max-w-2xl py-6 lg:py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Compass className="animate-spin [animation-duration:3s]" size={24} />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Planning your trip</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Agents work in parallel. This usually takes 1–2 minutes.</p>
        <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.max(6, (done / Math.max(visible.length, 1)) * 100)}%` }} />
        </div>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {visible.map((step) => {
          const { state, message } = states[step.id]
          return (
            <div key={step.id} className="flex items-center gap-3 px-4 py-3">
              <span className={clsx('grid h-8 w-8 place-items-center rounded-lg', state === 'done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>
                {step.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white">{step.label}</div>
                {message && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{message}</div>}
              </div>
              {state === 'done' && <CheckCircle2 className="text-emerald-500" size={18} />}
              {state === 'running' && <Loader2 className="animate-spin text-brand-500" size={18} />}
              {state === 'failed' && <XCircle className="text-rose-500" size={18} />}
              {state === 'waiting' && <CircleDashed className="text-slate-300 dark:text-slate-600" size={18} />}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
