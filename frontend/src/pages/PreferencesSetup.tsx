import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { server, useAccount, type Interest, type Profile, type TravelParty, type TravelStyle } from '../lib/account'
import { toast } from '../lib/toast'
import { firstTripIdea, INTERESTS, PARTIES, STYLES } from '../lib/travelProfile'
import { useStore } from '../store'

const MAX_INTERESTS = 4

/**
 * Right after sign-up (after the photo step): three quick questions, one per screen, like a
 * product's welcome survey. The answers become the planner's defaults: interests fill the trip
 * preferences, the party fills the traveler count, and the style picks the starting package.
 */
export function PreferencesSetup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('redirect') || '/'
  const profile = useAccount((s) => s.profile)
  const setProfile = useAccount((s) => s.setProfile)
  const reset = useStore((s) => s.reset)
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [interests, setInterests] = useState<Interest[]>(profile?.preferences.interests ?? [])
  const [party, setParty] = useState<TravelParty>(profile?.preferences.travelParty ?? '')
  const [style, setStyle] = useState<TravelStyle>(profile?.preferences.travelStyle ?? '')
  const [saving, setSaving] = useState(false)
  const firstName = profile?.fullName.split(/\s+/)[0]

  const canContinue = [interests.length > 0, !!party, !!style][step] ?? true
  const go = (to: number) => {
    setDirection(to > step ? 'forward' : 'back')
    setStep(to)
  }

  const save = async (body: Record<string, unknown>) => {
    const { user } = await server<{ user: Profile }>('/api/me', { method: 'PATCH', body })
    setProfile(user)
  }

  const advance = async () => {
    if (!canContinue) return
    if (step < 2) return go(step + 1)
    setSaving(true)
    try {
      await save({ surveyDone: true, preferences: { interests, travelParty: party, travelStyle: style } })
      go(3)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Your answers could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Enter continues, like a form.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && step < 3 && canContinue && !(event.target instanceof HTMLButtonElement)) void advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const skip = async () => {
    try {
      sessionStorage.setItem('wt-survey-later', '1')
    } catch {
      /* ignore */
    }
    await save({ surveyDone: true }).catch(() => undefined)
    navigate(next, { replace: true })
  }

  const startFirstTrip = () => {
    reset()
    navigate(`/?q=${encodeURIComponent(firstTripIdea(interests, party, style, profile?.preferences.homeCity ?? ''))}`, { replace: true })
  }

  const toggleInterest = (id: Interest) =>
    setInterests((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_INTERESTS ? list : [...list, id]))

  return (
    <main className="relative flex flex-1 items-start justify-center overflow-hidden px-4 py-8 sm:items-center sm:py-12">
      {/* Travel-themed backdrop: dotted map, a dashed flight path and soft colour */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 animate-blob rounded-full bg-brand-200/50 blur-3xl dark:bg-brand-500/15" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 animate-blob rounded-full bg-coral-100/70 blur-3xl [animation-delay:-7s] dark:bg-coral-500/10" aria-hidden="true" />
      <svg className="pointer-events-none absolute right-[8%] top-16 hidden h-32 w-72 text-brand-300 lg:block dark:text-brand-500/40" viewBox="0 0 300 130" fill="none" aria-hidden="true">
        <path id="survey-path" d="M5 120 C 80 10, 210 10, 295 60" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" className="animate-dash" />
        <path d="M-7 -5 L9 0 L-7 5 L-4 0 Z" className="fill-brand-600 dark:fill-brand-300">
          <animateMotion dur="8s" repeatCount="indefinite" rotate="auto">
            <mpath href="#survey-path" />
          </animateMotion>
        </path>
      </svg>

      <div className="relative w-full max-w-3xl">
        {step < 3 && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label="Question progress">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <span className={clsx('block h-full rounded-full bg-brand-700 transition-all duration-500 dark:bg-brand-400', i <= step ? 'w-full' : 'w-0')} />
                </span>
              ))}
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-500">Step {step + 1} of 3</span>
            <button onClick={() => void skip()} className="shrink-0 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">Skip</button>
          </div>
        )}

        <div key={step} className={clsx('rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-lift backdrop-blur sm:p-8 dark:border-white/10 dark:bg-ink-800/90', direction === 'forward' ? 'animate-[slide-in-right_0.35s_ease-out_both]' : 'animate-[slide-in-left_0.35s_ease-out_both]')}>
          {step === 0 && (
            <Question
              kicker={firstName ? `Welcome aboard, ${firstName}!` : 'Welcome aboard!'}
              title="What kind of trips excite you?"
              hint={`Pick up to ${MAX_INTERESTS}. Your plans will lean towards these.`}
            >
              <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                {INTERESTS.map((item) => {
                  const on = interests.includes(item.id)
                  const full = !on && interests.length >= MAX_INTERESTS
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleInterest(item.id)}
                      aria-pressed={on}
                      disabled={full}
                      className={clsx(
                        'group relative flex flex-col items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition sm:p-4',
                        on ? 'border-brand-600 bg-brand-50 shadow-soft dark:border-brand-400 dark:bg-brand-500/10' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft dark:border-white/10 dark:bg-ink-900/40',
                        full && 'cursor-not-allowed opacity-40 hover:translate-y-0',
                      )}
                    >
                      <span className={clsx('grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-105', item.tint)}>{item.icon}</span>
                      <span>
                        <span className="block text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>
                      </span>
                      <Tick on={on} />
                    </button>
                  )
                })}
              </div>
            </Question>
          )}

          {step === 1 && (
            <Question kicker="Your travel crew" title="Who do you usually travel with?" hint="We'll size flights, rooms and activities for your group.">
              <div className="stagger grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {PARTIES.map((item) => (
                  <Choice key={item.id} on={party === item.id} onClick={() => setParty(item.id)} icon={item.icon} label={item.label} hint={item.hint} />
                ))}
              </div>
            </Question>
          )}

          {step === 2 && (
            <Question kicker="Your travel style" title="How do you like to travel?" hint="This picks the starting package. You can switch any time on a plan.">
              <div className="stagger grid gap-3 sm:grid-cols-3">
                {STYLES.map((item) => {
                  const on = style === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setStyle(item.id)}
                      aria-pressed={on}
                      className={clsx(
                        'relative flex flex-col rounded-2xl border-2 p-4 text-left transition sm:p-5',
                        on ? 'border-brand-600 bg-brand-50 shadow-soft dark:border-brand-400 dark:bg-brand-500/10' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft dark:border-white/10 dark:bg-ink-900/40',
                      )}
                    >
                      <span className={clsx('grid h-11 w-11 place-items-center rounded-xl', on ? 'bg-brand-700 text-white dark:bg-brand-500' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200')}>{item.icon}</span>
                      <span className="mt-3 text-base font-extrabold text-slate-900 dark:text-white">{item.label}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>
                      <ul className="mt-3 space-y-1 text-[13px] text-slate-600 dark:text-slate-300">
                        {item.points.map((point) => (
                          <li key={point} className="flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> {point}</li>
                        ))}
                      </ul>
                      <Tick on={on} />
                    </button>
                  )
                })}
              </div>
            </Question>
          )}

          {step === 3 && (
            <div className="py-4 text-center">
              <div className="mx-auto grid h-16 w-16 animate-pop place-items-center rounded-full bg-emerald-500 text-white shadow-lift">
                <Check size={32} strokeWidth={3} />
              </div>
              <h1 className="mt-5 text-2xl font-extrabold text-slate-900 sm:text-3xl dark:text-white">You're all set{firstName ? `, ${firstName}` : ''}!</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">Every plan now starts from your travel profile. Change it any time in Settings → Preferences.</p>
              <div className="stagger mt-5 flex flex-wrap justify-center gap-2">
                {interests.map((id) => {
                  const item = INTERESTS.find((x) => x.id === id)!
                  return <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-100">{item.label}</span>
                })}
                {party && <span className="inline-flex items-center rounded-full bg-coral-50 px-3 py-1 text-sm font-semibold text-coral-600 dark:bg-coral-500/15 dark:text-coral-400">{PARTIES.find((x) => x.id === party)?.label}</span>}
                {style && <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{STYLES.find((x) => x.id === style)?.label}</span>}
              </div>
              <div className="mx-auto mt-7 max-w-md rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-4 text-left dark:border-brand-400/40 dark:bg-brand-500/10">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-200"><Sparkles size={13} /> A first trip for you</div>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">“{firstTripIdea(interests, party, style, profile?.preferences.homeCity ?? '')}”</p>
              </div>
              <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
                <button onClick={() => navigate(next, { replace: true })} className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">I'll plan later</button>
                <button onClick={startFirstTrip} className="btn-shine inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-800 dark:bg-brand-500">
                  Plan this trip <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step < 3 && (
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-white/10">
              <button onClick={() => go(step - 1)} disabled={step === 0} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:invisible dark:text-slate-300 dark:hover:bg-white/5">
                <ArrowLeft size={16} /> Back
              </button>
              <div className="flex items-center gap-3">
                {step === 0 && <span className="hidden text-xs text-slate-500 sm:inline">{interests.length}/{MAX_INTERESTS} picked</span>}
                <button onClick={() => void advance()} disabled={!canContinue || saving} className="btn-shine inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-brand-800 disabled:translate-y-0 disabled:opacity-40 dark:bg-brand-500">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {step === 2 ? 'Finish' : 'Continue'} {!saving && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function Question({ kicker, title, hint, children }: { kicker: string; title: string; hint: string; children: ReactNode }) {
  return (
    <>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-coral-600 dark:text-coral-400">{kicker}</div>
      <h1 className="mt-1.5 text-2xl font-extrabold text-slate-900 sm:text-3xl dark:text-white">{title}</h1>
      <p className="mb-6 mt-1.5 text-sm text-slate-600 dark:text-slate-300">{hint}</p>
      {children}
    </>
  )
}

function Choice({ on, onClick, icon, label, hint }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        'relative flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition',
        on ? 'border-brand-600 bg-brand-50 shadow-soft dark:border-brand-400 dark:bg-brand-500/10' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft dark:border-white/10 dark:bg-ink-900/40',
      )}
    >
      <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-xl transition', on ? 'bg-brand-700 text-white dark:bg-brand-500' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-slate-900 dark:text-white">{label}</span>
        <span className="block text-sm text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
      <Tick on={on} />
    </button>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={clsx('absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full transition', on ? 'scale-100 bg-brand-700 text-white dark:bg-brand-500' : 'scale-75 border border-slate-300 opacity-0 group-hover:opacity-100 dark:border-white/20')}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}
