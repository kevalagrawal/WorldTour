import clsx from 'clsx'
import { Archive, ArchiveRestore, Check, Link2, Pencil, Plus, Repeat, Search, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui'
import { server, type TripSummary } from '../lib/account'
import { useStore } from '../store'
import { ErrorNote, IconButton, Page, Skeleton, TripCard } from './common'

type Filter = 'active' | 'favorite' | 'planned' | 'planning' | 'archived'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'All' },
  { id: 'favorite', label: 'Favourites' },
  { id: 'planned', label: 'Planned' },
  { id: 'planning', label: 'Not planned yet' },
  { id: 'archived', label: 'Archived' },
]

export function HistoryPage() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<'recent' | 'oldest' | 'budget' | 'name'>('recent')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<TripSummary | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const navigate = useNavigate()
  const reset = useStore((s) => s.reset)

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ sort, page: String(nextPage), limit: '12' })
      if (query) params.set('search', query)
      if (filter === 'favorite') params.set('favorite', 'true')
      params.set('status', filter === 'favorite' ? 'active' : filter)
      try {
        const data = await server<{ trips: TripSummary[]; total: number; page: number; pages: number }>(`/api/trips?${params}`)
        setTrips((current) => (nextPage === 1 ? data.trips : [...current, ...data.trips]))
        setTotal(data.total)
        setPage(data.page)
        setPages(data.pages)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your trips.')
      } finally {
        setLoading(false)
      }
    },
    [query, filter, sort],
  )
  useEffect(() => void load(1), [load])

  const patch = async (trip: TripSummary, body: Record<string, unknown>) => {
    const { trip: updated } = await server<{ trip: TripSummary }>(`/api/trips/${trip.id}`, { method: 'PATCH', body })
    setTrips((list) => list.map((t) => (t.id === trip.id ? updated : t)).filter((t) => (filter === 'archived' ? t.status === 'archived' : t.status !== 'archived')))
  }

  const share = async (trip: TripSummary) => {
    const { share: link } = await server<{ share: { url: string } }>(`/api/trips/${trip.id}/share`, { method: 'POST' })
    await navigator.clipboard?.writeText(link.url).catch(() => undefined)
    setTrips((list) => list.map((t) => (t.id === trip.id ? { ...t, shared: true } : t)))
    setCopied(trip.id)
    setTimeout(() => setCopied(null), 2500)
  }

  const planAgain = (trip: TripSummary) => {
    reset()
    navigate(`/?q=${encodeURIComponent(trip.firstPrompt)}`)
  }

  return (
    <Page
      wide
      title="My trips"
      subtitle={total ? `${total} trip${total > 1 ? 's' : ''} · every prompt and itinerary is saved automatically` : 'Every trip you plan while signed in is saved here.'}
      action={
        <button onClick={() => { reset(); navigate('/') }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 dark:bg-brand-500">
          <Plus size={16} /> New trip
        </button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 dark:border-white/15 dark:bg-ink-800">
          <Search size={17} className="text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by destination, city or what you asked…" aria-label="Search trips" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort trips" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium dark:border-white/15 dark:bg-ink-800 dark:text-white">
          <option value="recent">Recently updated</option>
          <option value="oldest">Oldest first</option>
          <option value="budget">Highest budget</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={clsx('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition', filter === f.id ? 'bg-brand-700 text-white dark:bg-brand-500' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-white/10 dark:bg-ink-800 dark:text-slate-300')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorNote onRetry={() => void load(1)}>{error}</ErrorNote>
      ) : loading && !trips.length ? (
        <Skeleton rows={4} />
      ) : !trips.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-white/15 dark:bg-ink-800">
          <img src="/logo-globe.svg" alt="" width={64} height={64} className="mx-auto" />
          <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{query || filter !== 'active' ? 'No trips match' : 'No trips yet'}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{query || filter !== 'active' ? 'Try another search or filter.' : 'Plan a trip and it will appear here, with every prompt and itinerary.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              actions={
                <>
                  <IconButton label={trip.favorite ? 'Remove from favourites' : 'Add to favourites'} pressed={trip.favorite} onClick={() => void patch(trip, { favorite: !trip.favorite })}>
                    <Star size={16} className={trip.favorite ? 'fill-amber-400 text-amber-400' : ''} />
                  </IconButton>
                  <IconButton label="Rename" onClick={() => setRenaming({ id: trip.id, title: trip.title })}><Pencil size={15} /></IconButton>
                  {trip.versions > 0 && (
                    <IconButton label={copied === trip.id ? 'Link copied' : 'Copy share link'} onClick={() => void share(trip)}>
                      {copied === trip.id ? <Check size={16} className="text-emerald-600" /> : <Link2 size={16} />}
                    </IconButton>
                  )}
                  {trip.firstPrompt && <IconButton label="Plan again from this prompt" onClick={() => planAgain(trip)}><Repeat size={15} /></IconButton>}
                  <IconButton label={trip.status === 'archived' ? 'Restore' : 'Archive'} onClick={() => void patch(trip, { status: trip.status === 'archived' ? 'planned' : 'archived' })}>
                    {trip.status === 'archived' ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </IconButton>
                  <IconButton label="Delete" tone="danger" onClick={() => setRemoving(trip)}><Trash2 size={15} /></IconButton>
                </>
              }
            />
          ))}
          {page < pages && (
            <button onClick={() => void load(page + 1)} disabled={loading} className="mx-auto mt-2 block rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Delete this trip?"
        body={<>“{removing?.title}”, its conversation and all {removing?.versions ?? 0} itinerary versions will be deleted for good.</>}
        confirmLabel="Delete trip"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const trip = removing!
          setRemoving(null)
          void server(`/api/trips/${trip.id}`, { method: 'DELETE' }).then(() => {
            setTrips((list) => list.filter((t) => t.id !== trip.id))
            setTotal((n) => n - 1)
            if (useStore.getState().tripId === trip.id) useStore.getState().setTripId(null)
          })
        }}
      />
      {renaming && (
        <RenameDialog
          title={renaming.title}
          onCancel={() => setRenaming(null)}
          onSave={(title) => {
            const trip = trips.find((t) => t.id === renaming.id)!
            setRenaming(null)
            void patch(trip, { title })
          }}
        />
      )}
    </Page>
  )
}

export function RenameDialog({ title, onSave, onCancel }: { title: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(title)
  return (
    <ConfirmDialog
      open
      icon={<Pencil size={20} />}
      title="Rename trip"
      body={
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
          aria-label="Trip name"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSave(value.trim())}
          className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-white/15 dark:bg-ink-900 dark:text-white"
        />
      }
      confirmLabel="Save"
      focusConfirm={false}
      onCancel={onCancel}
      onConfirm={() => value.trim() && onSave(value.trim())}
    />
  )
}
