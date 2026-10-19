import { CalendarDays, MapPin, Users, Wallet } from 'lucide-react'
import { formatLocal, prettyDate } from '../lib/money'
import { useStore } from '../store'

/** What the chat has understood so far, shown above the input. */
export function TripSummary() {
  const summary = useStore((s) => s.summary)
  if (!summary || !(summary.destination || summary.origin)) return null
  const route = [summary.origin, summary.destination].filter(Boolean).join(' → ')
  const dates = summary.start_date
    ? `${prettyDate(summary.start_date)}${summary.end_date && summary.end_date !== summary.start_date ? ` – ${prettyDate(summary.end_date)}` : ''}`
    : summary.duration_days
      ? 'Dates flexible'
      : null
  const items = [
    { icon: <MapPin size={13} />, text: route },
    { icon: <CalendarDays size={13} />, text: [dates, summary.duration_days && `${summary.duration_days} days`].filter(Boolean).join(' · ') },
    { icon: <Users size={13} />, text: summary.travelers ? `${summary.travelers} traveler${summary.travelers > 1 ? 's' : ''}` : '' },
    {
      icon: <Wallet size={13} />,
      text: summary.budget != null ? `${formatLocal(summary.budget, summary.currency)}${summary.budget_scope === 'per_person' ? ' pp' : ''}` : '',
    },
  ].filter((item) => item.text)

  return (
    <div className="mx-4 mb-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 dark:border-slate-700">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trip so far</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        {items.map((item, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="text-slate-400">{item.icon}</span>
            {item.text}
          </span>
        ))}
        {summary.pace && <span className="capitalize text-slate-500">· {summary.pace} pace</span>}
        {summary.preferences.length > 0 && <span className="text-slate-500">· {summary.preferences.join(', ')}</span>}
        {summary.transport_preferences.length > 0 && <span className="text-slate-500">· by {summary.transport_preferences.join('/')}</span>}
      </div>
    </div>
  )
}
