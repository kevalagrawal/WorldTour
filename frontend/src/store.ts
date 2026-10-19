import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError, runPlan, sendChat } from './lib/api'
import type { AgentEvent, ChatMessage, Plan, Session, Summary } from './lib/types'

type Status = 'idle' | 'thinking' | 'planning'

interface State {
  messages: ChatMessage[]
  session: Session | null
  summary: Summary | null
  plan: Plan | null
  events: AgentEvent[]
  status: Status
  notice: string | null
  error: string | null
  accessCode: string | null
  needsAccessCode: boolean
  send: (text: string) => Promise<void>
  /** Re-sends the last unanswered message, or restarts planning. */
  retry: () => Promise<void>
  reset: () => void
  setAccessCode: (code: string) => void
  setNeedsAccessCode: (value: boolean) => void
  dismissError: () => void
}

const now = () => new Date().toISOString()

export const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi, I'm your WorldTour travel assistant. Tell me where you'd like to go, from where, for how long, your budget and who's coming.\n\n" +
    "I'll ask for anything missing, check the trip is realistic, then plan transport, hotels, weather and an hour-by-hour itinerary.",
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const plan = async (session: Session) => {
        set({ status: 'planning', events: [], notice: null })
        const result = await runPlan(
          session,
          get().accessCode,
          (event) => set((s) => ({ events: [...s.events, event] })),
          () => set({ events: [], notice: 'The connection dropped — restarting the plan…' }),
        )
        set((s) => ({
          plan: result.plan,
          session: result.session,
          status: 'idle',
          notice: null,
          messages: [
            ...s.messages,
            {
              role: 'assistant',
              at: now(),
              content:
                'Your plan is ready! Explore it on the right. To change anything, just tell me — for example "premium", "by train", "more relaxed", "5 days" or "remove <place>".',
            },
          ],
        }))
      }

      const handleError = (error: unknown) => {
        const status = error instanceof ApiError ? error.status : 0
        if (status === 401) set({ needsAccessCode: true })
        set({ status: 'idle', notice: null, error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' })
      }

      return {
        messages: [WELCOME],
        session: null,
        summary: null,
        plan: null,
        events: [],
        status: 'idle',
        notice: null,
        error: null,
        accessCode: null,
        needsAccessCode: false,

        send: async (text: string) => {
          const message = text.trim()
          if (!message || get().status !== 'idle') return
          set((s) => ({
            // A message that failed earlier is replaced by this attempt rather than shown twice.
            messages: [...s.messages.filter((m) => !m.failed), { role: 'user', content: message, at: now() }],
            status: 'thinking',
            error: null,
          }))
          try {
            const response = await sendChat(get().session, message, get().accessCode)
            set((s) => ({
              messages: [...s.messages, { role: 'assistant', content: response.reply, at: now() }],
              session: response.session,
              summary: response.summary ?? s.summary,
            }))
            if (!response.ready) {
              set({ status: 'idle' })
              return
            }
            await plan(response.session)
          } catch (error) {
            // If the chat failed before an answer, keep the message on screen marked as not sent,
            // so the traveler stays in the conversation and can send it again with one tap.
            if (get().status === 'thinking') {
              set((s) => ({
                messages: s.messages.map((m, i) => (i === s.messages.length - 1 && m.role === 'user' ? { ...m, failed: true } : m)),
              }))
            }
            handleError(error)
          }
        },

        retry: async () => {
          const unsent = get().messages.at(-1)
          if (unsent?.role === 'user' && unsent.failed) return get().send(unsent.content)
          const { session } = get()
          if (!session || session.stage !== 'ready' || get().status !== 'idle') return
          set({ error: null })
          try {
            await plan(session)
          } catch (error) {
            handleError(error)
          }
        },

        reset: () =>
          set({ messages: [WELCOME], session: null, summary: null, plan: null, events: [], status: 'idle', error: null, notice: null }),
        setAccessCode: (code) => set({ accessCode: code.trim() || null, needsAccessCode: false, error: null }),
        setNeedsAccessCode: (value) => set({ needsAccessCode: value }),
        dismissError: () => set({ error: null }),
      }
    },
    {
      name: 'worldtour-session',
      version: 2,
      migrate: (state) => state as State,
      // Keep the conversation and plan across reloads, but never resume mid-request.
      partialize: (s) => ({ messages: s.messages, session: s.session, summary: s.summary, plan: s.plan, accessCode: s.accessCode }),
    },
  ),
)

/** True once the traveler has said something (the landing page gives way to the workspace). */
export const useStarted = () => useStore((s) => s.messages.some((m) => m.role === 'user') || !!s.plan)
