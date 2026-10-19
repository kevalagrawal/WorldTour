import { BedDouble, CalendarClock, CloudSun, Coins, MessagesSquare, ShieldCheck, TrainFront } from 'lucide-react'

const FEATURES = [
  { icon: <MessagesSquare size={18} />, title: 'Plan by chatting', text: 'Describe the trip in your own words; I ask only for what is missing.' },
  { icon: <ShieldCheck size={18} />, title: 'Reality check first', text: 'Too far for the days, too many cities, or a budget that cannot work — I tell you before planning.' },
  { icon: <TrainFront size={18} />, title: 'Every way to travel', text: 'Live flight fares, plus trains, buses and cabs for trips within a country.' },
  { icon: <BedDouble size={18} />, title: 'Three packages', text: 'Budget, Balanced and Premium, each fully costed, with live hotel rates.' },
  { icon: <CalendarClock size={18} />, title: 'Hour-by-hour days', text: 'Transfers, sights, meals and check-in, with cab fares and walking times.' },
  { icon: <Coins size={18} />, title: 'Your currency', text: 'Prices in ₹, €, £ or $ — whatever you use.' },
  { icon: <CloudSun size={18} />, title: 'Weather-aware', text: 'Outdoor sights avoid rainy days and the midday heat; packing tips included.' },
]

export function Welcome() {
  return (
    <div className="mx-auto max-w-3xl py-6 lg:py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Your whole trip,{' '}
          <span className="bg-gradient-to-r from-brand-600 to-teal-500 bg-clip-text text-transparent">planned in a chat</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-slate-400">
          Eight specialist agents search flights, trains, hotels, weather and places, then optimize a plan that fits your days and budget.
        </p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {feature.icon}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{feature.title}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">{feature.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
