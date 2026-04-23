import type { LessonLockReason } from '../../core/lesson'
import type { Lesson } from '../../core/types'
import { getUnlockConsequenceCopy } from './unlockConsequenceCopy'

interface Props {
  lesson: Lesson
  lockReason: LessonLockReason
  skippedLessons: Lesson[]
  onConfirm: () => void
  onDismiss: () => void
}

export default function UnlockDialog({
  lesson,
  lockReason,
  skippedLessons,
  onConfirm,
  onDismiss,
}: Props) {
  const title = lockReason.type === 'relearning' ? 'Practice First' : 'Take It Step by Step'
  const confirmLabel = lockReason.type === 'relearning' ? 'Open Lesson Anyway' : 'Skip Ahead Anyway'
  const explanation =
    lockReason.type === 'relearning'
      ? 'You already have birds in relearning. Opening a new lesson now can make those mix-ups harder to untangle.'
      : 'This lesson is still locked because the guided path expects you to finish the earlier lesson first.'
  const consequence = getUnlockConsequenceCopy(skippedLessons, lesson.lesson)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center"
      data-testid="unlock-dialog-backdrop"
      onClick={onDismiss}
    >
      <div
        aria-labelledby="unlock-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-xl"
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <p className="mb-2 text-sm font-medium text-primary">Lesson {lesson.lesson}</p>
        <h2 className="mb-3 text-2xl font-semibold text-text" id="unlock-dialog-title">
          {title}
        </h2>
        <p className="mb-3 text-sm leading-6 text-text">{explanation}</p>
        <p className="mb-6 text-sm leading-6 text-text-muted">{consequence}</p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-full border border-border px-5 py-3 text-sm font-medium text-text"
            onClick={onDismiss}
          >
            Never mind
          </button>
          <button
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-white"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
