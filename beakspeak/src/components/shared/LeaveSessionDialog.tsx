import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'

export default function LeaveSessionDialog() {
  const pending = useAppStore(s => s.pendingSessionExit)
  const guard = useAppStore(s => s.sessionGuard)
  if (!pending || !guard) return null
  return <Dialog busy={guard.busy} {...guard.prompt} />
}

interface DialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  busy: boolean
}

function Dialog({ title, message, confirmLabel, cancelLabel, busy }: DialogProps) {
  const confirmSessionExit = useAppStore(s => s.confirmSessionExit)
  const cancelSessionExit = useAppStore(s => s.cancelSessionExit)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButtonRef.current?.focus()
    return () => {
      // Leaving unmounts the control that opened the dialog; only return focus if it survived.
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelSessionExit()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelSessionExit])

  return (
    <div
      className="safe-area-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="leave-session-backdrop"
      onClick={cancelSessionExit}
    >
      <div
        ref={dialogRef}
        aria-labelledby="leave-session-title"
        aria-describedby="leave-session-message"
        aria-modal="true"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-bg p-6 shadow-xl"
        role="alertdialog"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={e => {
          if (e.key !== 'Tab') return
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
          if (!focusable?.length) {
            e.preventDefault()
            return
          }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }}
      >
        <h2 className="mb-3 text-2xl font-semibold text-text" id="leave-session-title">{title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-text" id="leave-session-message">{message}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-white"
            onClick={cancelSessionExit}
          >
            {cancelLabel}
          </button>
          <button
            className="rounded-full border border-border px-5 py-3 text-sm font-medium text-text disabled:opacity-50"
            disabled={busy}
            onClick={confirmSessionExit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
