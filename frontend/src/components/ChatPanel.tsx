import clsx from 'clsx'
import { AlertCircle, Bot, RefreshCw, SendHorizonal, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { retryPlan, useStore } from '../store'
import { TripSummary } from './TripSummary'

const STARTERS = [
  'Plan a 4 day trip from Ahmedabad to Goa for 2 people under ₹60,000, beaches and food',
  'A relaxed week in Paris from London in December for 2, budget 3000 EUR, museums',
  'Mumbai to Jaipur by train, 3 days, 2 people, ₹40,000, history',
  '5 days from Delhi to Dubai for a family of 4, 2 lakh, shopping',
]
const CHANGES = ['Premium', 'Budget', 'By train', 'More relaxed', 'More activities', '+1 day', 'Add beaches']

export function ChatPanel() {
  const { messages, status, error, send, dismissError, plan, session } = useStore()
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const busy = status !== 'idle'

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, status])

  const submit = (value: string) => {
    if (!value.trim() || busy) return
    void send(value)
    setText('')
  }

  const quickChange = (label: string) => {
    if (label === '+1 day') {
      const days = plan?.duration.days
      submit(days ? `${days + 1} days` : '5 days')
    } else {
      submit(label.toLowerCase())
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={clsx('flex gap-2.5', message.role === 'user' && 'justify-end')}>
            {message.role === 'assistant' && (
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <Bot size={15} />
              </div>
            )}
            <div
              className={clsx(
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                message.role === 'user'
                  ? 'rounded-br-md bg-brand-600 text-white'
                  : 'rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
              )}
            >
              {message.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <Bot size={15} />
            </div>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            {status === 'planning' ? 'Planning your trip…' : 'Thinking…'}
          </div>
        )}
        {messages.length === 1 && !busy && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Sparkles size={13} /> Try one of these
            </div>
            {STARTERS.map((starter) => (
              <button
                key={starter}
                onClick={() => submit(starter)}
                className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
              >
                {starter}
              </button>
            ))}
          </div>
        )}
      </div>

      <TripSummary />

      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            {error}
            {session?.stage === 'ready' && (
              <button onClick={() => void retryPlan()} className="ml-2 inline-flex items-center gap-1 font-semibold underline">
                <RefreshCw size={13} /> Try again
              </button>
            )}
          </div>
          <button onClick={dismissError} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {plan && !busy && (
        <div className="scroll-thin flex gap-1.5 overflow-x-auto px-4 pb-2">
          {CHANGES.map((label) => (
            <button
              key={label}
              onClick={() => quickChange(label)}
              className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(text)
        }}
        className="border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(text)
              }
            }}
            rows={1}
            placeholder={plan ? 'Change something… e.g. "by train" or "budget 80000 INR"' : 'Describe your trip…'}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-slate-400"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            <SendHorizonal size={17} />
          </button>
        </div>
      </form>
    </div>
  )
}
