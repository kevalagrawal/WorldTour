import clsx from 'clsx'
import { ArrowUp, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onSend: (text: string) => void
  busy?: boolean
  placeholder?: string
  size?: 'md' | 'lg'
  autoFocus?: boolean
  hint?: boolean
  /** Text to start with, e.g. a prompt from a destination guide link. */
  initialText?: string
  /** id for the text box, so other parts of the page can focus it. */
  inputId?: string
}

/** Auto-growing message box: Enter sends, Shift+Enter adds a line. */
export function Composer({ onSend, busy = false, placeholder = 'Describe your trip…', size = 'md', autoFocus = false, hint = true, initialText = '', inputId }: Props) {
  const [text, setText] = useState(initialText)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, size === 'lg' ? 220 : 160)}px`
  }, [text, size])

  const submit = () => {
    if (!text.trim() || busy) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className={clsx(
          'flex items-end gap-2 rounded-2xl border bg-white transition dark:bg-ink-800',
          'border-slate-200 shadow-soft focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-white/10 dark:focus-within:border-brand-400/60',
          size === 'lg' ? 'p-2.5 sm:p-3' : 'p-2',
        )}
      >
        <textarea
          id={inputId}
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          aria-label="Message"
          className={clsx(
            'min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-slate-400',
            size === 'lg' ? 'min-h-[52px] px-2 py-3 text-base' : 'min-h-[40px] px-2 py-2 text-[15px]',
          )}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Send message"
          className={clsx(
            'grid shrink-0 place-items-center rounded-lg bg-brand-700 text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-slate-500',
            size === 'lg' ? 'h-12 w-12' : 'h-10 w-10',
          )}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={size === 'lg' ? 20 : 18} strokeWidth={2.4} />}
        </button>
      </form>
      {hint && (
        <p className="mt-1.5 hidden px-1 text-[11px] text-slate-400 sm:block">
          <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
        </p>
      )}
    </div>
  )
}
