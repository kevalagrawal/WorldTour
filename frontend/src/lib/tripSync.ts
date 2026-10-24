// Saves the trip being planned to the signed-in traveler's account: every prompt, every reply, every
// generated itinerary (the server keeps each new plan as a version) and their package/flight/hotel picks.
// Guests are not saved; a trip planned as a guest is saved as soon as they sign in.

import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { server, ServerError, useSession } from './account'

const DELAY_MS = 1500

export function useTripSync(): void {
  const { enabled, signedIn } = useSession()
  const messages = useStore((s) => s.messages)
  const session = useStore((s) => s.session)
  const plan = useStore((s) => s.plan)
  const selection = useStore((s) => s.selection)
  const status = useStore((s) => s.status)
  const tripId = useStore((s) => s.tripId)
  const setTripId = useStore((s) => s.setTripId)
  const creating = useRef(false)
  const lastSent = useRef('')

  useEffect(() => {
    if (!enabled || !signedIn || status !== 'idle') return
    const sent = messages.filter((m) => !m.failed && m.content.trim())
    if (!sent.some((m) => m.role === 'user')) return
    const body = {
      messages: sent.map((m) => ({ role: m.role, content: m.content.slice(0, 8000), at: m.at })),
      session,
      plan,
      selection: selection ? { ...selection } : null,
    }
    const key = JSON.stringify([tripId, body.messages.length, body.messages.at(-1)?.content, plan?.estimated_cost, plan?.trip_summary, session?.stage, selection])
    if (key === lastSent.current) return
    const timer = setTimeout(async () => {
      try {
        if (!tripId) {
          if (creating.current) return
          creating.current = true
          const { trip } = await server<{ trip: { id: string } }>('/api/trips', { method: 'POST', body })
          setTripId(trip.id)
        } else {
          await server(`/api/trips/${tripId}/sync`, { method: 'PUT', body })
        }
        lastSent.current = key
      } catch (error) {
        // A trip deleted from History while still open here: start a fresh saved trip next time.
        if (error instanceof ServerError && error.status === 404) setTripId(null)
      } finally {
        creating.current = false
      }
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, signedIn, status, messages, session, plan, selection, tripId, setTripId])
}
