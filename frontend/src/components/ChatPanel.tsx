import clsx from 'clsx'
import { AlertTriangle, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Composer } from './Composer'
import { MessageContent } from './MessageContent'
import { useProgress } from '../lib/progress'

const AFTER_PLAN = [
  { label: 'Premium', send: 'premium' },
  { label: 'Budget', send: 'budget' },
  { label: 'By train', send: 'by train' },
  { label: 'More relaxed', send: 'more relaxed' },
  { label: 'More activities', send: 'more activities' },
  { label: 'Add beaches', send: 'add beaches' },
]
const FEASIBILITY = [
  { label: 'Yes, apply suggestions', send: 'yes' },
  { label: 'Continue as is', send: 'continue' },
]

function time(at?: string) {
  if (!at) return ''
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function AssistantAvatar({ small = false }: { small?: boolean }) {
  return (
    <div className={clsx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm', small ? 'h-7 w-7' : 'h-9 w-9')}>
      <Sparkles size={small ? 13 : 16} />
    </div>
  )
}

export function ChatPanel() {
  const { messages, status, error, notice, send, retry, dismissError, plan, session } = useStore()
  const listRef = useRef<HTMLDivElement>(null)
  const busy = status !== 'idle'

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, status, error])

  const quick = busy ? [] : session?.stage === 'feasibility' ? FEASIBILITY : plan && session?.stage === 'planned' ? AFTER_PLAN : []
  const daysChip = plan?.duration.days && session?.stage === 'planned' && !busy ? [{ label: `${plan.duration.days + 1} days`, send: `${plan.duration.days + 1} days` }] : []
  const progress = useProgress()

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-ink-900">
      <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-white/10">
        <AssistantAvatar />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold text-slate-900 dark:text-white">Travel assistant</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={clsx('h-1.5 w-1.5 rounded-full', busy ? 'animate-pulse bg-amber-400' : 'bg-emerald-500')} />
            {status === 'planning' ? 'Building your plan…' : status === 'thinking' ? 'Typing…' : 'Online · replies in seconds'}
          </div>
        </div>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const grouped = previous?.role === message.role
          if (message.role === 'user') {
            return (
              <div key={index} className="flex animate-fade-up flex-col items-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-brand-600 to-brand-700 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
                  {message.content}
                </div>
                {time(message.at) && <span className="mt-1 text-[11px] text-slate-400">{time(message.at)}</span>}
              </div>
            )
          }
          return (
            <div key={index} className="flex animate-fade-up gap-2.5">
              <div className="w-7 shrink-0">{!grouped && <AssistantAvatar small />}</div>
              <div className="min-w-0 max-w-[88%]">
                <div className="rounded-2xl rounded-tl-md border border-slate-200/80 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed text-slate-800 dark:border-white/10 dark:bg-ink-800 dark:text-slate-100">
                  <MessageContent text={message.content} />
                </div>
                {time(message.at) && <span className="mt-1 block text-[11px] text-slate-400">{time(message.at)}</span>}
              </div>
            </div>
          )
        })}

        {status === 'thinking' && (
          <div className="flex gap-2.5">
            <AssistantAvatar small />
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-slate-200/80 bg-slate-50 px-4 py-3.5 text-slate-400 dark:border-white/10 dark:bg-ink-800">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-2 w-2 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {status === 'planning' && (
          <div className="flex gap-2.5">
            <AssistantAvatar small />
            <div className="w-full max-w-[88%] rounded-2xl rounded-tl-md border border-brand-200 bg-brand-50/70 px-4 py-3 dark:border-brand-400/30 dark:bg-brand-500/10">
              <div className="flex items-center justify-between text-sm font-semibold text-brand-800 dark:text-brand-200">
                <span>Planning your trip</span>
                <span className="text-xs font-medium">{progress.finished} of {progress.total} steps</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-white/10">
                <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${Math.max(5, (progress.finished / Math.max(progress.total, 1)) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-brand-700/80 dark:text-brand-200/80">{notice ?? 'Comparing transport, hotels, weather and places — usually under a minute.'}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex gap-2.5">
            <div className="w-7 shrink-0" />
            <div className="w-full max-w-[88%] rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1">{error}</div>
                <button onClick={dismissError} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                  <X size={15} />
                </button>
              </div>
              {session?.stage === 'ready' && (
                <button
                  onClick={() => void retry()}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  <RefreshCw size={13} /> Try planning again
                </button>
              )}
              {session?.stage !== 'ready' && <p className="mt-1.5 text-xs opacity-80">Your message wasn't lost — just send it again.</p>}
            </div>
          </div>
        )}
      </div>

      {(quick.length > 0 || daysChip.length > 0) && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5">
          {[...quick, ...daysChip].map((chip) => (
            <button
              key={chip.label}
              onClick={() => void send(chip.send)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:bg-ink-800 dark:text-slate-200 dark:hover:bg-brand-500/15"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-slate-200/80 bg-white/90 px-3 pb-3 pt-3 backdrop-blur dark:border-white/10 dark:bg-ink-900/90">
        <Composer
          onSend={(text) => void send(text)}
          busy={busy}
          placeholder={plan ? 'Ask for a change, e.g. "by train"' : 'Type your reply…'}
        />
      </div>
    </div>
  )
}
