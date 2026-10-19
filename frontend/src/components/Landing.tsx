import { ArrowRight, BedDouble, CalendarClock, CheckCircle2, CloudSun, Coins, MessagesSquare, Plane, ShieldCheck, Sparkles, TrainFront, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import { Composer } from './Composer'
import { Logo } from './ui'

const YEAR = new Date().getFullYear()

const PROMPTS = [
  '4 days in Goa from Ahmedabad for 2, under ₹60,000',
  'Relaxed week in Paris from London, 3000 EUR',
  'Jaipur by train from Delhi, 3 days, history',
]

const DESTINATIONS = [
  { city: 'Goa', country: 'India', tag: 'Beaches & Portuguese quarters', emoji: '🏖️', gradient: 'from-amber-400 via-orange-500 to-rose-500',
    prompt: 'Plan a 4 day trip from Ahmedabad to Goa for 2 people under ₹60,000, beaches and food, relaxed' },
  { city: 'Dubai', country: 'UAE', tag: 'Skyline, souks & desert', emoji: '🏙️', gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    prompt: '5 days from Mumbai to Dubai for 2 people, budget 1.5 lakh, shopping and culture' },
  { city: 'Jaipur', country: 'India', tag: 'Forts, palaces & bazaars', emoji: '🏰', gradient: 'from-pink-400 via-rose-500 to-red-600',
    prompt: 'Delhi to Jaipur by train, 3 days for 2 people, ₹30,000, history and culture' },
  { city: 'Paris', country: 'France', tag: 'Museums, cafés & boulevards', emoji: '🗼', gradient: 'from-violet-400 via-purple-500 to-fuchsia-600',
    prompt: 'A relaxed week in Paris from London in December for 2 people, budget 3000 EUR, museums and food' },
  { city: 'Tokyo', country: 'Japan', tag: 'Neon nights & quiet temples', emoji: '⛩️', gradient: 'from-red-400 via-rose-500 to-pink-600',
    prompt: '7 days from Delhi to Tokyo for 2 people in March, budget 4 lakh, culture and food' },
  { city: 'Bali', country: 'Indonesia', tag: 'Beaches & rice terraces', emoji: '🌴', gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    prompt: '6 days from Mumbai to Bali for a couple, ₹1.2 lakh, beaches and nature, relaxed' },
]

const STEPS = [
  { icon: <MessagesSquare size={20} />, title: 'Tell us your trip', text: 'Where, when, budget and who is coming — in your own words. We only ask for what is missing.' },
  { icon: <ShieldCheck size={20} />, title: 'We check & plan', text: 'A reality check first, then nine agents compare flights, trains, hotels, weather and places in parallel.' },
  { icon: <Wand2 size={20} />, title: 'Refine & book', text: 'Switch packages, change dates or pace by chatting, then book with direct links or save it to your calendar.' },
]

const FEATURES = [
  { icon: <Plane size={20} />, title: 'Live fares & hotel rates', text: 'Real Google Flights and Google Hotels prices for your exact dates.' },
  { icon: <TrainFront size={20} />, title: 'Every way to travel', text: 'Trains, buses and cabs for domestic and nearby trips, priced by road distance.' },
  { icon: <BedDouble size={20} />, title: 'Three costed packages', text: 'Budget, Balanced and Premium — travel, stay, food, transfers and entry fees.' },
  { icon: <CalendarClock size={20} />, title: 'Hour-by-hour days', text: 'Every transfer with distance, time and fare, plus meals, check-in and departures.' },
  { icon: <CloudSun size={20} />, title: 'Weather-aware', text: 'Outdoor sights avoid rainy days and the midday heat, with packing tips.' },
  { icon: <Coins size={20} />, title: 'Your currency', text: 'Prices in ₹, €, £ or $ — whichever you plan in.' },
]

export function Landing() {
  const send = useStore((s) => s.send)
  const busy = useStore((s) => s.status !== 'idle')

  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section id="plan" className="relative">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-400/25 via-sky-300/20 to-coral-400/20 blur-3xl dark:from-brand-600/25 dark:via-sky-500/10 dark:to-coral-500/10" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24">
          <div className="animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm dark:border-brand-400/30 dark:bg-white/5 dark:text-brand-200">
              <Sparkles size={13} /> Nine AI agents · live prices · your currency
            </div>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.08] text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
              Plan your whole trip
              <br className="hidden sm:block" /> in{' '}
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-coral-500 bg-clip-text text-transparent">one conversation</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
              Tell WorldTour where you want to go. It checks the trip is realistic, compares flights, trains and hotels, and builds an hour-by-hour itinerary that fits your days and budget.
            </p>

            <div className="mt-8 max-w-xl">
              <Composer onSend={(text) => void send(text)} busy={busy} size="lg" placeholder="e.g. 5 days in Dubai from Mumbai for 2, budget ₹1.5 lakh" />
              <div className="mt-3 flex flex-wrap gap-2">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt)}
                    disabled={busy}
                    className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
              {['Free to use', 'No sign-up', 'Real-time prices'].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-500" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* Destinations */}
      <section id="destinations" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Inspiration" title="Popular trips to start from" text="Pick one and we'll plan it — you can change anything afterwards." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESTINATIONS.map((d) => (
            <button
              key={d.city}
              onClick={() => void send(d.prompt)}
              disabled={busy}
              className="group relative overflow-hidden rounded-3xl text-left shadow-soft transition hover:-translate-y-1 hover:shadow-lift disabled:opacity-60"
            >
              <div className={`relative h-44 bg-gradient-to-br ${d.gradient}`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
                <span className="absolute bottom-3 right-5 text-7xl drop-shadow-lg transition duration-300 group-hover:scale-110">{d.emoji}</span>
                <div className="absolute left-5 top-5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{d.country}</div>
              </div>
              <div className="border-x border-b border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-ink-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{d.city}</h3>
                  <ArrowRight size={18} className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-600" />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{d.tag}</p>
                <p className="mt-3 line-clamp-2 text-xs text-slate-400">“{d.prompt}”</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-slate-200/80 bg-white py-16 dark:border-white/10 dark:bg-ink-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From idea to itinerary in about a minute" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="relative rounded-3xl border border-slate-200/80 bg-slate-50 p-6 dark:border-white/10 dark:bg-ink-900">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-lift">{step.icon}</span>
                  <span className="font-display text-sm font-bold text-brand-600 dark:text-brand-300">Step {index + 1}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Why WorldTour" title="Everything a good travel agent would do" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-ink-800">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{f.icon}</span>
              <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-6 py-12 text-center text-white shadow-lift sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-coral-500/30 blur-3xl" />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">Where to next?</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/80">Describe the trip and get a complete, costed plan in about a minute.</p>
          <a href="#plan" className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-lg transition hover:bg-brand-50">
            Start planning <ArrowRight size={16} />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-coral-500">{eyebrow}</div>
      <h2 className="mt-2 text-balance text-3xl font-extrabold text-slate-900 sm:text-4xl dark:text-white">{title}</h2>
      {text && <p className="mt-3 text-slate-600 dark:text-slate-400">{text}</p>}
    </div>
  )
}

/** A static, illustrative glimpse of what a finished plan looks like. */
function ProductPreview() {
  const rows = [
    { time: '09:30', icon: '🚕', text: 'Cab to Fort Aguada', meta: '9.7 km · 25 min · ₹195' },
    { time: '10:00', icon: '🏰', text: 'Fort Aguada', meta: 'History · 2 h' },
    { time: '12:30', icon: '🍽️', text: 'Lunch near Candolim', meta: '~₹400 per person' },
    { time: '14:00', icon: '🏖️', text: 'Calangute Beach', meta: 'Beach · 2.5 h' },
    { time: '19:30', icon: '🍷', text: 'Dinner at Gunpowder', meta: 'Assagao' },
  ]
  return (
    <div className="relative mx-auto w-full max-w-md animate-fade-up lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-500/15 to-coral-500/15 blur-2xl" />
      <div className="relative rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lift dark:border-white/10 dark:bg-ink-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Example plan</div>
            <div className="font-display text-lg font-bold text-slate-900 dark:text-white">Goa · 4 days · 2 travelers</div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Within budget</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Budget', '₹33k', false],
            ['Balanced', '₹40k', true],
            ['Premium', '₹72k', false],
          ].map(([label, price, chosen]) => (
            <div key={label as string} className={`rounded-xl border p-2.5 ${chosen ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 dark:border-white/10'}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className="font-display text-base font-bold text-slate-900 dark:text-white">{price}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-900">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>DAY 2 · SUN 13 DEC</span>
            <span>☀️ 32° · 💧0%</span>
          </div>
          <ol className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.time} className="flex items-start gap-3">
                <span className="w-11 shrink-0 font-mono text-xs text-slate-400">{row.time}</span>
                <span className="text-base leading-none">{row.icon}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{row.text}</div>
                  <div className="truncate text-xs text-slate-500">{row.meta}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="float-slow absolute -top-11 left-6 hidden rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-lift sm:block dark:border-white/10 dark:bg-ink-800">
        <div className="text-[11px] text-slate-500">Getting there</div>
        <div className="text-sm font-semibold text-slate-900 dark:text-white">🚆 Train 3AC · ₹1,770</div>
      </div>
      <div className="float-slow absolute -bottom-7 right-6 hidden rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-lift [animation-delay:1.5s] sm:block dark:border-white/10 dark:bg-ink-800">
        <div className="text-[11px] text-slate-500">Hotel · 4★</div>
        <div className="text-sm font-semibold text-slate-900 dark:text-white">🏨 Live rate ₹6,267/night</div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white dark:border-white/10 dark:bg-ink-900">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            A multi-agent trip planner. Prices are planning estimates — always confirm on the booking site before you pay.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Data from</div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <li>Google Flights & Google Hotels (via SerpApi)</li>
            <li>OpenStreetMap, OSRM & Geoapify</li>
            <li>Open-Meteo weather · Frankfurter rates</li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Explore</div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <li><a href="#destinations" className="hover:text-slate-900 dark:hover:text-white">Popular trips</a></li>
            <li><a href="#how" className="hover:text-slate-900 dark:hover:text-white">How it works</a></li>
            <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200/80 py-5 text-center text-xs text-slate-400 dark:border-white/10">
        © {YEAR} WorldTour. Made for travelers.
      </div>
    </footer>
  )
}
