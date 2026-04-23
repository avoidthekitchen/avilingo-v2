import { useCallback, useEffect, useRef } from 'react'
import type { LessonLockReason } from '../../core/lesson'
import type { Lesson } from '../../core/types'
import { getUnlockConsequenceCopy } from './unlockConsequenceCopy'

interface Props {
  lesson: Lesson
  lockReason: LessonLockReason
  skippedLessons: Lesson[]
  pending: boolean
  onConfirm: () => void
  onDismiss: () => void
}

export default function UnlockDialog({
  lesson,
  lockReason,
  skippedLessons,
  pending,
  onConfirm,
  onDismiss,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const title = lockReason.type === 'relearning' ? 'Practice First' : 'Take It Step by Step'
  const confirmLabel = lockReason.type === 'relearning' ? 'Open Lesson Anyway' : 'Skip Ahead Anyway'
  const explanation =
    lockReason.type === 'relearning'
      ? 'You already have birds in relearning. Opening a new lesson now can make those mix-ups harder to untangle.'
      : 'This lesson is still locked because the guided path expects you to finish the earlier lesson first.'
  const consequence = getUnlockConsequenceCopy(skippedLessons, lesson.lesson)

  const handleDismiss = useCallback(() => {
    if (!pending) onDismiss()
  }, [pending, onDismiss])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center"
      data-testid="unlock-dialog-backdrop"
      onClick={handleDismiss}
    >
      <div
        ref={dialogRef}
        aria-labelledby="unlock-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-xl"
        role="dialog"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Tab') {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              'button',
            )
            if (!focusable?.length) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first.focus()
            }
          }
        }}
      >
        <p className="mb-2 text-sm font-medium text-primary">Lesson {lesson.lesson}</p>
        <h2 className="mb-3 text-2xl font-semibold text-text" id="unlock-dialog-title">
          {title}
        </h2>
        <p className="mb-3 text-sm leading-6 text-text">{explanation}</p>
        <p className="mb-6 text-sm leading-6 text-text-muted">{consequence}</p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-full border border-border px-5 py-3 text-sm font-medium text-text disabled:opacity-50"
            disabled={pending}
            onClick={handleDismiss}
          >
            Never mind
          </button>
          <button
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Unlocking…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
