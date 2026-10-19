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
  error: string | null
  accessCode: string | null
  needsAccessCode: boolean
  send: (text: string) => Promise<void>
  reset: () => void
  setAccessCode: (code: string) => void
  setNeedsAccessCode: (value: boolean) => void
  dismissError: () => void
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! Tell me about the trip you have in mind — where from, where to, how long, your budget and who's coming. " +
    "I'll ask for anything I still need, check it's realistic, then plan transport, hotels, weather and a full timetable.",
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      messages: [WELCOME],
      session: null,
      summary: null,
      plan: null,
      events: [],
      status: 'idle',
      error: null,
      accessCode: null,
      needsAccessCode: false,

      send: async (text: string) => {
        const message = text.trim()
        if (!message || get().status !== 'idle') return
        set((s) => ({ messages: [...s.messages, { role: 'user', content: message }], status: 'thinking', error: null }))
        try {
          const response = await sendChat(get().session, message, get().accessCode)
          set((s) => ({
            messages: [...s.messages, { role: 'assistant', content: response.reply }],
            session: response.session,
            summary: response.summary ?? s.summary,
          }))
          if (!response.ready) {
            set({ status: 'idle' })
            return
          }
          set({ status: 'planning', events: [] })
          const result = await runPlan(response.session, get().accessCode, (event) =>
            set((s) => ({ events: [...s.events, event] })),
          )
          set((s) => ({
            plan: result.plan,
            session: result.session,
            status: 'idle',
            messages: [
              ...s.messages,
              {
                role: 'assistant',
                content:
                  'Your plan is ready! You can keep chatting to change it — try "premium", "by train", ' +
                  '"more relaxed", "5 days", "budget 80000 INR" or "remove <place>".',
              },
            ],
          }))
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 0
          if (status === 401) set({ needsAccessCode: true })
          set((s) => ({
            status: 'idle',
            error: error instanceof Error ? error.message : 'Something went wrong.',
            // A failed planning step leaves the chat ready to try the same trip again.
            session: s.session?.stage === 'ready' ? { ...s.session, stage: 'ready' } : s.session,
          }))
        }
      },

      reset: () => set({ messages: [WELCOME], session: null, summary: null, plan: null, events: [], status: 'idle', error: null }),
      setAccessCode: (code) => set({ accessCode: code.trim() || null, needsAccessCode: false, error: null }),
      setNeedsAccessCode: (value) => set({ needsAccessCode: value }),
      dismissError: () => set({ error: null }),
    }),
    {
      name: 'worldtour-session',
      // Keep the conversation and plan across reloads, but never resume mid-request.
      partialize: (s) => ({ messages: s.messages, session: s.session, summary: s.summary, plan: s.plan, accessCode: s.accessCode }),
    },
  ),
)

/** Retry planning after an error, when the chat had already collected a complete trip. */
export async function retryPlan(): Promise<void> {
  const { session, accessCode } = useStore.getState()
  if (!session || session.stage !== 'ready') return
  useStore.setState({ status: 'planning', events: [], error: null })
  try {
    const result = await runPlan(session, accessCode, (event) => useStore.setState((s) => ({ events: [...s.events, event] })))
    useStore.setState({ plan: result.plan, session: result.session, status: 'idle' })
  } catch (error) {
    useStore.setState({ status: 'idle', error: error instanceof Error ? error.message : 'Planning failed.' })
  }
}
