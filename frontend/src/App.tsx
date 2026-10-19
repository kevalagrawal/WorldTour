import clsx from 'clsx'
import { Map, MessageSquare } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AccessCode } from './components/AccessCode'
import { ChatPanel } from './components/ChatPanel'
import { Header } from './components/Header'
import { PlanningProgress } from './components/PlanningProgress'
import { Welcome } from './components/Welcome'

// The plan view carries the map and chart libraries; load it only once there is a plan.
const PlanView = lazy(() => import('./components/plan/PlanView').then((m) => ({ default: m.PlanView })))
import { health } from './lib/api'
import { useStore } from './store'

export default function App() {
  const { plan, status, needsAccessCode, accessCode, setNeedsAccessCode } = useStore()
  const [mobileView, setMobileView] = useState<'chat' | 'plan'>('chat')
  const planning = status === 'planning'

  useEffect(() => {
    health()
      .then((info) => info.access_code_required && !accessCode && setNeedsAccessCode(true))
      .catch(() => undefined) // the chat shows a clear error if the API is unreachable
  }, [accessCode, setNeedsAccessCode])

  // On phones, jump to the plan when planning starts or a new plan arrives.
  const marker = planning ? 'planning' : plan ? `${plan.trip_summary}|${plan.estimated_cost}` : 'none'
  const [lastMarker, setLastMarker] = useState(marker)
  if (marker !== lastMarker) {
    setLastMarker(marker)
    if (marker !== 'none') setMobileView('plan')
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 lg:grid-cols-[420px_1fr]">
        <aside
          className={clsx(
            'min-h-0 border-slate-200 bg-white lg:flex lg:h-[calc(100vh-3.5rem)] lg:flex-col lg:border-r dark:border-slate-800 dark:bg-slate-950',
            mobileView === 'chat' ? 'flex h-[calc(100vh-3.5rem-3.5rem)] flex-col' : 'hidden',
          )}
        >
          <ChatPanel />
        </aside>
        <section
          className={clsx(
            'scroll-thin min-h-0 overflow-y-auto px-4 pb-20 pt-4 lg:block lg:h-[calc(100vh-3.5rem)] lg:pb-4',
            mobileView === 'plan' ? 'block' : 'hidden',
          )}
        >
          {planning ? (
            <PlanningProgress />
          ) : plan ? (
            <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading your plan…</div>}>
              <PlanView plan={plan} />
            </Suspense>
          ) : (
            <Welcome />
          )}
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-[1000] grid h-14 grid-cols-2 border-t border-slate-200 bg-white lg:hidden dark:border-slate-800 dark:bg-slate-950">
        {[
          { id: 'chat' as const, label: 'Chat', icon: <MessageSquare size={18} /> },
          { id: 'plan' as const, label: planning ? 'Planning…' : 'Plan', icon: <Map size={18} /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setMobileView(item.id)}
            className={clsx('flex flex-col items-center justify-center gap-0.5 text-xs font-medium', mobileView === item.id ? 'text-brand-600' : 'text-slate-500')}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {needsAccessCode && <AccessCode />}
    </div>
  )
}
