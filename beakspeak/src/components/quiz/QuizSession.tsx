import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { buildQuizSession } from '../../core/quiz'
import { scheduleReview, ratingFromOutcome } from '../../core/fsrs'
import { createNewProgress } from '../../core/fsrs'
import ThreeChoiceQuiz from './ThreeChoiceQuiz'
import SameDifferent from './SameDifferent'
import QuizResult from './QuizResult'
import SaveError from '../shared/SaveError'
import type { Species, UserProgress } from '../../core/types'

interface Props {
  mode: 'review' | 'practice'
  onComplete: () => void
}

interface QuizAnswer {
  species: Species
  correct: boolean
  rating: number
}

interface PendingAnswer {
  index: number
  result: QuizAnswer
  progress?: UserProgress
  progressSaved: boolean
  logPending: boolean
  chosenId: string
}

export default function QuizSession({ mode, onComplete }: Props) {
  const manifest = useAppStore(s => s.manifest)
  const allProgress = useAppStore(s => s.allProgress)
  const lastPlayedClipId = useAppStore(s => s.lastPlayedClipId)
  const updateProgress = useAppStore(s => s.updateProgress)
  const logConfusion = useAppStore(s => s.logConfusion)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const [showResults, setShowResults] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const pendingAnswer = useRef<PendingAnswer | null>(null)
  const savingRef = useRef(false)

  const [items] = useState(() => {
    if (!manifest) return []
    return buildQuizSession(allProgress, manifest, lastPlayedClipId)
  })

  const savePendingAnswer = useCallback(async () => {
    const pending = pendingAnswer.current
    if (!pending || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(false)
    try {
      if (pending.progress && !pending.progressSaved) {
        await updateProgress(pending.result.species.id, pending.progress)
        pending.progressSaved = true
      }
      if (pending.logPending) {
        await logConfusion(pending.result.species.id, pending.chosenId)
        pending.logPending = false
      }
      setAnswers(prev => [...prev, pending.result])
      pendingAnswer.current = null
      if (pending.index + 1 >= items.length) setShowResults(true)
      else setCurrentIndex(pending.index + 1)
    } catch {
      setSaveError(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [items.length, updateProgress, logConfusion])

  const handleAnswer = useCallback((correct: boolean, responseTimeMs: number, chosenId = 'unknown') => {
    const item = items[currentIndex]
    if (!item || pendingAnswer.current) return
    const rating = ratingFromOutcome(correct, responseTimeMs, item.exerciseType)
    const existing = allProgress.get(item.targetSpecies.id) ?? createNewProgress(item.targetSpecies.id)
    // Freeze the scheduled card once. Retrying a log failure after the card saved
    // must not count the same answer as another review.
    pendingAnswer.current = {
      index: currentIndex,
      result: { species: item.targetSpecies, correct, rating },
      progress: mode === 'review' ? scheduleReview({ ...existing, introduced: true }, rating) : undefined,
      progressSaved: false,
      logPending: mode === 'review' && !correct,
      chosenId,
    }
    void savePendingAnswer()
  }, [items, currentIndex, allProgress, mode, savePendingAnswer])

  if (!manifest || items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-text-muted">No quiz items available.</p>
        <button onClick={onComplete} className="mt-4 px-4 py-2 bg-primary text-white rounded-full">
          Back
        </button>
      </div>
    )
  }

  if (showResults) {
    return <QuizResult answers={answers} mode={mode} onDone={onComplete} />
  }

  const currentItem = items[currentIndex]

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between">
        <button disabled={saving} onClick={onComplete} className="text-sm text-text-muted">← Quit</button>
        <p className="text-sm text-text-muted">
          {currentIndex + 1} / {items.length}
        </p>
      </div>
      {mode === 'practice' && (
        <div className="px-4 pb-4 text-center">
          <p className="text-sm font-medium text-primary">Practice Session</p>
          <p className="text-xs text-text-muted">This won&apos;t change your review schedule</p>
        </div>
      )}
      <div className="flex-1">
        {saveError ? (
          <SaveError message="Your answer could not be fully saved. Retry to continue." onRetry={() => { void savePendingAnswer() }} onBack={onComplete} backLabel="Quit session" />
        ) : saving ? (
          <p role="status" className="p-6 text-center">Saving answer…</p>
        ) : currentItem.exerciseType === 'three_choice' ? (
          <ThreeChoiceQuiz
            key={currentIndex}
            item={currentItem}
            onAnswer={handleAnswer}
          />
        ) : (
          <SameDifferent
            key={currentIndex}
            item={currentItem}
            onAnswer={handleAnswer}
          />
        )}
      </div>
    </div>
  )
}
