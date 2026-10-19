import clsx from 'clsx'
import { BedDouble, Bus, Car, Check, CloudSun, Luggage, Package as PackageIcon, Plane, Star, TrainFront } from 'lucide-react'
import { clockFromIso, duration, formatMoney, prettyDate, type Display } from '../../lib/money'
import type { Flight, Plan } from '../../lib/types'
import { weatherEmoji } from '../../lib/weather'
import { useStore } from '../../store'
import { Badge, Card, ExternalLink, SectionTitle } from '../ui'

export function Overview({ plan, display }: { plan: Plan; display: Display }) {
  return (
    <div className="space-y-4">
      <Packages plan={plan} display={display} />
      <GettingThere plan={plan} display={display} />
      <Hotels plan={plan} display={display} />
      <Weather plan={plan} />
    </div>
  )
}

function Packages({ plan, display }: { plan: Plan; display: Display }) {
  const send = useStore((s) => s.send)
  const busy = useStore((s) => s.status !== 'idle')
  if (!plan.packages.length) return null
  return (
    <Card className="p-4">
      <SectionTitle icon={<PackageIcon size={18} />} title="Packages" subtitle="Each is fully costed: travel, stay, food, local transport and entry fees." />
      <div className="grid gap-3 md:grid-cols-3">
        {plan.packages.map((pkg) => {
          const chosen = pkg.name === plan.recommended_package
          return (
            <div
              key={pkg.name}
              className={clsx(
                'flex flex-col rounded-xl border p-4 transition',
                chosen ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{pkg.label}</span>
                {chosen && <Badge tone="brand"><Check size={12} /> Selected</Badge>}
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{formatMoney(pkg.total, display)}</div>
              <div className="mb-3">
                <Badge tone={pkg.fits_budget ? 'green' : 'red'}>{pkg.fits_budget ? 'Within budget' : 'Over budget'}</Badge>
              </div>
              <ul className="flex-1 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                {pkg.transport && <li className="flex gap-2"><ModeIcon kind={pkg.transport.kind} /> {pkg.transport.label}</li>}
                {pkg.hotels.map((hotel) => (
                  <li key={hotel.option_id} className="flex gap-2">
                    <BedDouble size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      {hotel.name}
                      <span className="text-slate-400"> · {formatMoney(hotel.price_per_night, display)}/night</span>
                    </span>
                  </li>
                ))}
              </ul>
              {!chosen && (
                <button
                  disabled={busy}
                  onClick={() => void send(pkg.name)}
                  className="mt-3 rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-brand-500/10"
                >
                  Switch to {pkg.label}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ModeIcon({ kind }: { kind: string }) {
  const cls = 'mt-0.5 shrink-0 text-slate-400'
  if (kind === 'flight') return <Plane size={15} className={cls} />
  if (kind === 'train') return <TrainFront size={15} className={cls} />
  if (kind === 'bus') return <Bus size={15} className={cls} />
  return <Car size={15} className={cls} />
}

function GettingThere({ plan, display }: { plan: Plan; display: Display }) {
  const choice = plan.transport_choice
  const flights = plan.selected_flights
  if (!choice && !plan.ground_options.length && !flights.length) return null
  return (
    <Card className="p-4">
      <SectionTitle
        icon={<Luggage size={18} />}
        title="Getting there & back"
        subtitle={choice ? `Selected: ${choice.label} — ${formatMoney(choice.round_trip_total, display)} for everyone, both ways${choice.price_is_estimate ? ' (estimate)' : ''}` : undefined}
      />
      {plan.ground_options.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            By road or rail{plan.road_km ? ` · ${Math.round(plan.road_km)} km by road` : ''}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.ground_options.map((option) => (
              <div
                key={option.option_id}
                className={clsx(
                  'flex items-center gap-3 rounded-xl border p-3',
                  choice?.option_id === option.option_id ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700',
                )}
              >
                <ModeIcon kind={option.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</div>
                  <div className="text-xs text-slate-500">
                    {duration(option.duration_minutes)}
                    {option.overnight ? ' · overnight' : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatMoney(option.price_pp, display, true)}</div>
                  <div className="text-[11px] text-slate-500">per person, one way</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {flights.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <FlightList title="Outbound flights" flights={flights} chosen={plan.recommended_outbound_id} display={display} />
          <FlightList title="Return flights" flights={plan.return_flights} chosen={plan.recommended_return_id} display={display} />
        </div>
      )}
    </Card>
  )
}

function FlightList({ title, flights, chosen, display }: { title: string; flights: Flight[]; chosen: string | null; display: Display }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-2">
        {flights.slice(0, 4).map((flight) => (
          <div
            key={flight.option_id}
            className={clsx('rounded-xl border p-3 text-sm', flight.option_id === chosen ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900 dark:text-white">{flight.airline || 'Flight'}</span>
              <span className="font-semibold">
                {flight.price_included
                  ? <span className="text-xs font-normal text-slate-500">in round-trip fare</span>
                  : flight.price != null
                    ? `${formatMoney(flight.price, display, flight.price_is_estimate)}${flight.price_scope?.startsWith('round') ? ' rt' : ''} pp`
                    : 'fare n/a'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-slate-600 dark:text-slate-300">
              <span>{flight.origin} {clockFromIso(flight.departure_time)}</span>
              <span className="text-slate-400">→</span>
              <span>{flight.destination} {clockFromIso(flight.arrival_time)}</span>
              <span className="text-xs text-slate-500">
                · {duration(flight.duration_minutes)} · {flight.stops ? `${flight.stops} stop${flight.stops > 1 ? 's' : ''}${flight.via ? ` via ${flight.via}` : ''}` : 'direct'}
              </span>
            </div>
            <div className="text-xs text-slate-400">{flight.flight_number}</div>
          </div>
        ))}
        {flights.length === 0 && <div className="text-sm text-slate-500">None found.</div>}
      </div>
    </div>
  )
}

function Hotels({ plan, display }: { plan: Plan; display: Display }) {
  if (!plan.selected_hotels.length) return null
  const chosen = new Set(plan.recommended_hotel_ids)
  const hotels = [...plan.selected_hotels].sort((a, b) => Number(chosen.has(b.option_id)) - Number(chosen.has(a.option_id)))
  return (
    <Card className="p-4">
      <SectionTitle icon={<BedDouble size={18} />} title="Hotels" subtitle="Live rates for your dates where available; ★ is in the selected package." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hotels.map((hotel) => (
          <div key={hotel.option_id} className={clsx('rounded-xl border p-3', chosen.has(hotel.option_id) ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 dark:border-slate-700')}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{hotel.name}</div>
              {chosen.has(hotel.option_id) && <Badge tone="brand">★ Selected</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {hotel.stars ? <span>{'★'.repeat(Math.round(hotel.stars))}</span> : hotel.tier && <span className="capitalize">{hotel.tier}</span>}
              {hotel.rating != null && (
                <span className="inline-flex items-center gap-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" /> {hotel.rating}
                  {hotel.reviews ? ` (${hotel.reviews.toLocaleString()})` : ''}
                </span>
              )}
              {hotel.verified_on_map === false && <Badge tone="amber">location unconfirmed</Badge>}
            </div>
            <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
              {hotel.price_per_night != null ? formatMoney(hotel.price_per_night, display, hotel.data_source !== 'live') : 'rate n/a'}
              <span className="text-xs font-normal text-slate-500"> / night</span>
            </div>
            {hotel.amenities && hotel.amenities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {hotel.amenities.slice(0, 4).map((a) => <Badge key={a}>{a}</Badge>)}
              </div>
            )}
            {hotel.link && <ExternalLink href={hotel.link} className="mt-2 inline-block text-xs">Hotel website</ExternalLink>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function Weather({ plan }: { plan: Plan }) {
  const weather = plan.weather_information
  return (
    <Card className="p-4">
      <SectionTitle icon={<CloudSun size={18} />} title="Weather & packing" subtitle={weather.summary ?? undefined} />
      {weather.dates_assumed && <p className="mb-2 text-xs text-amber-600">No travel dates were given, so the next few days are shown as a guide.</p>}
      <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
        {weather.days.map((day) => (
          <div key={`${day.day}-${day.date}`} className="min-w-[110px] rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
            <div className="text-xs font-semibold text-slate-500">Day {day.day}</div>
            <div className="text-xs text-slate-400">{prettyDate(day.date)}</div>
            <div className="my-1 text-2xl">{weatherEmoji(day.condition)}</div>
            <div className="text-sm font-semibold">{Math.round(day.temp_max_c ?? 0)}° <span className="font-normal text-slate-400">{Math.round(day.temp_min_c ?? 0)}°</span></div>
            <div className="text-xs capitalize text-slate-500">{day.condition}</div>
            <div className="text-xs text-sky-600">💧 {day.precipitation_probability ?? 0}%</div>
            {day.source === 'seasonal_historical' && <div className="mt-1 text-[10px] text-slate-400">typical</div>}
          </div>
        ))}
        {weather.days.length === 0 && <div className="text-sm text-slate-500">Weather is not available.</div>}
      </div>
      {plan.packing_tips.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {plan.packing_tips.map((tip) => (
            <li key={tip} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {tip}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
