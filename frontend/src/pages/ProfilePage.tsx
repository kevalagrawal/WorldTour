import { Award, CalendarDays, Heart, Layers, Mail, MapPin, MessageSquareText, Pencil, Phone, Plane } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/UserMenu'
import { server, useAccount, type TripSummary } from '../lib/account'
import { ErrorNote, money, Page, Panel, Skeleton, TripCard } from './common'

interface Stats {
  trips: number
  planned: number
  favorites: number
  plansGenerated: number
  prompts: number
  daysPlanned: number
  destinations: number
  topDestination: string | null
  budgetPlanned: { currency: string; amount: number }[]
}

export function ProfilePage() {
  const profile = useAccount((s) => s.profile)
  const [data, setData] = useState<{ stats: Stats; recent: TripSummary[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    server<{ stats: Stats; recent: TripSummary[] }>('/api/stats').then(setData).catch((e) => setError(e.message))
  }
  useEffect(load, [])

  const since = profile?.memberSince ? new Date(profile.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''
  return (
    <Page title="Your profile" action={<Link to="/settings" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-ink-800 dark:text-white"><Pencil size={15} /> Edit profile</Link>}>
      <div className="space-y-5">
        <Panel>
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <Avatar size={96} />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">{profile?.fullName || 'Traveler'}</h2>
              <div className="mt-2 flex flex-col gap-1.5 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5 dark:text-slate-300">
                {profile?.email && <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start"><Mail size={14} /> {profile.email}</span>}
                {profile?.phone && <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start"><Phone size={14} /> {profile.phone}</span>}
                {profile?.preferences.homeCity && <span className="inline-flex items-center justify-center gap-1.5 sm:justify-start"><MapPin size={14} /> {profile.preferences.homeCity}</span>}
              </div>
              {since && <p className="mt-2 text-xs text-slate-500">Member since {since}</p>}
            </div>
          </div>
        </Panel>

        {error ? (
          <ErrorNote onRetry={load}>{error}</ErrorNote>
        ) : !data ? (
          <Skeleton rows={2} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={<Plane size={15} />} label="Trips planned" value={data.stats.planned} />
              <Stat icon={<MapPin size={15} />} label="Destinations" value={data.stats.destinations} />
              <Stat icon={<CalendarDays size={15} />} label="Days of travel" value={data.stats.daysPlanned} />
              <Stat icon={<Layers size={15} />} label="Itineraries generated" value={data.stats.plansGenerated} />
              <Stat icon={<MessageSquareText size={15} />} label="Prompts sent" value={data.stats.prompts} />
              <Stat icon={<Heart size={15} />} label="Favourites" value={data.stats.favorites} />
              <Stat icon={<Award size={15} />} label="Top destination" value={data.stats.topDestination ?? '—'} />
              <Stat
                icon={<Plane size={15} />}
                label="Budget planned"
                value={data.stats.budgetPlanned.length ? data.stats.budgetPlanned.map((b) => money(b.amount, b.currency)).join(' + ') : '—'}
              />
            </div>
            <Panel title="Recent trips" description="Pick up where you left off.">
              {data.recent.length ? (
                <div className="space-y-3">
                  {data.recent.map((trip) => <TripCard key={trip.id} trip={trip} />)}
                  <Link to="/history" className="inline-block pt-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">See all your trips →</Link>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">No trips yet. <Link to="/" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Plan your first one</Link> — it is saved here automatically.</p>
              )}
            </Panel>
          </>
        )}
      </div>
    </Page>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-ink-800">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{icon} {label}</div>
      <div className="mt-1 truncate text-xl font-extrabold text-slate-900 dark:text-white">{value}</div>
    </div>
  )
}
