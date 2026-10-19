import clsx from 'clsx'
import { Map, MessageSquare } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AccessCode } from './components/AccessCode'
import { ChatPanel } from './components/ChatPanel'
import { Header } from './components/Header'
import { Landing } from './components/Landing'
import { PlanningProgress } from './components/PlanningProgress'
import { TripBrief } from './components/TripBrief'
import { health } from './lib/api'
import { useActivePlan, useStarted, useStore } from './store'

// The plan view carries the map and chart libraries; load it only once there is a plan.
const PlanView = lazy(() => import('./components/plan/PlanView').then((m) => ({ default: m.PlanView })))

export default function App() {
  const { needsAccessCode, accessCode, setNeedsAccessCode } = useStore()
  const started = useStarted()

  useEffect(() => {
    // Also wakes the serverless API up early, so the first message answers faster.
    health()
      .then((info) => info.access_code_required && !accessCode && setNeedsAccessCode(true))
      .catch(() => undefined)
  }, [accessCode, setNeedsAccessCode])

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      {started ? <Workspace /> : <Landing />}
      {needsAccessCode && <AccessCode />}
    </div>
  )
}

function Workspace() {
  const { plan, status } = useStore()
  const active = useActivePlan()
  const planning = status === 'planning'
  const [mobileView, setMobileView] = useState<'chat' | 'trip'>('chat')

  // On phones and tablets, jump to the trip view when planning starts or a new plan arrives.
  const marker = planning ? 'planning' : plan ? `${plan.trip_summary}|${plan.estimated_cost}` : 'none'
  const [lastMarker, setLastMarker] = useState(marker)
  if (marker !== lastMarker) {
    setLastMarker(marker)
    if (marker !== 'none') setMobileView('trip')
  }

  return (
    <>
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
        <aside
          className={clsx(
            'min-h-0 border-slate-200/80 lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:border-r dark:border-white/10',
            mobileView === 'chat' ? 'flex h-[calc(100dvh-4rem-4rem)] flex-col' : 'hidden',
          )}
        >
          <ChatPanel />
        </aside>
        <section
          className={clsx(
            'min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:block lg:pb-10 lg:pt-6',
            mobileView === 'trip' ? 'block' : 'hidden',
          )}
        >
          {planning ? (
            <PlanningProgress />
          ) : active ? (
            <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">Loading your plan…</div>}>
              <PlanView plan={active} />
            </Suspense>
          ) : (
            <TripBrief />
          )}
        </section>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-[1000] grid h-16 grid-cols-2 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-white/10 dark:bg-ink-900/95"
        aria-label="Switch view"
      >
        {[
          { id: 'chat' as const, label: 'Chat', icon: <MessageSquare size={20} /> },
          { id: 'trip' as const, label: planning ? 'Planning…' : plan ? 'Your plan' : 'Trip brief', icon: <Map size={20} /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setMobileView(item.id)}
            className={clsx(
              'relative flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition',
              mobileView === item.id ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500',
            )}
          >
            {mobileView === item.id && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand-700 dark:bg-brand-300" />}
            {item.icon}
            {item.label}
            {item.id === 'trip' && plan && mobileView === 'chat' && <span className="absolute right-[38%] top-2.5 h-2 w-2 rounded-full bg-coral-500" />}
          </button>
        ))}
      </nav>
    </>
  )
}
