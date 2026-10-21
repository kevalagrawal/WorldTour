import { CalendarPlus, Download, ExternalLink as LinkIcon, FileDown, Info, MapPinned, Plane, TrainFront } from 'lucide-react'
import { useState } from 'react'
import { downloadExport } from '../../lib/api'
import type { Display } from '../../lib/money'
import type { Plan } from '../../lib/types'
import { Card, ExternalLink, SectionTitle } from '../ui'

export function BookExport({ plan, onPdf }: { plan: Plan; display: Display; onPdf: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const links = plan.links || {}

  const download = async (kind: 'text' | 'ics') => {
    setBusy(kind)
    setError(null)
    try {
      await downloadExport(kind, plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <SectionTitle icon={<LinkIcon size={18} />} title="Book" subtitle="Prices here are planning estimates — confirm on these sites." />
        <ul className="space-y-2 text-sm">
          {links.ground && (
            <li className="flex items-center gap-2"><TrainFront size={15} className="text-slate-400" /><ExternalLink href={links.ground.url}>{links.ground.label}</ExternalLink></li>
          )}
          {links.flights && (
            <li className="flex items-center gap-2"><Plane size={15} className="text-slate-400" /><ExternalLink href={links.flights}>Flights on Google Flights</ExternalLink></li>
          )}
          {links.hotels?.map((hotel) => (
            <li key={hotel.url} className="flex items-center gap-2"><LinkIcon size={15} className="text-slate-400" /><ExternalLink href={hotel.url}>{hotel.name} on Booking.com</ExternalLink></li>
          ))}
        </ul>
        {!!links.places?.length && (
          <>
            <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><MapPinned size={13} /> On the map</div>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {links.places.map((place) => (
                <li key={`${place.day}-${place.name}`}>
                  <span className="text-slate-400">Day {place.day} · </span>
                  <ExternalLink href={place.url}>{place.name}</ExternalLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle icon={<Download size={18} />} title="Take it with you" />
        <div className="flex flex-wrap gap-2">
          <button onClick={onPdf} className="inline-flex items-center gap-2 rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white hover:bg-coral-600">
            <FileDown size={15} /> Download PDF itinerary
          </button>
          <button onClick={() => void download('text')} disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5">
            <Download size={15} /> {busy === 'text' ? 'Preparing…' : 'Download plan (.txt)'}
          </button>
          <button
            onClick={() => void download('ics')}
            disabled={!!busy || !plan.dates.start_date}
            title={plan.dates.start_date ? 'Add every timetable item to your calendar' : 'Add travel dates to get a calendar file'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <CalendarPlus size={15} /> {busy === 'ics' ? 'Preparing…' : 'Add to calendar (.ics)'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">The PDF is an e-ticket style travel document with photos, journey and hotel details, costs and every day's timetable. In the print window, choose “Save as PDF”.</p>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        {!plan.dates.start_date && <p className="mt-2 text-xs text-slate-500">Tell me your travel dates in the chat to unlock the calendar file.</p>}
      </Card>

      <Card className="p-4 lg:col-span-2">
        <SectionTitle icon={<Info size={18} />} title="Notes" />
        <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          {[...plan.data_notes, ...plan.warnings].map((note) => (
            <li key={note} className="flex gap-2"><span className="text-slate-400">•</span>{note}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
