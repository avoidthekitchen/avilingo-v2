import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { buildQuizSession } from '../../core/quiz'
import { scheduleReview, ratingFromOutcome } from '../../core/fsrs'
import { createNewProgress } from '../../core/fsrs'
import ThreeChoiceQuiz from './ThreeChoiceQuiz'
import SameDifferent from './SameDifferent'
import QuizResult from './QuizResult'
import type { Species } from '../../core/types'

interface Props {
  onComplete: () => void
}

interface QuizAnswer {
  species: Species
  correct: boolean
  rating: number
}

export default function QuizSession({ onComplete }: Props) {
  const manifest = useAppStore(s => s.manifest)
  const allProgress = useAppStore(s => s.allProgress)
  const lastPlayedClipId = useAppStore(s => s.lastPlayedClipId)
  const updateProgress = useAppStore(s => s.updateProgress)
  const logConfusion = useAppStore(s => s.logConfusion)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const [showResults, setShowResults] = useState(false)

  const items = useMemo(() => {
    if (!manifest) return []
    return buildQuizSession(allProgress, manifest, lastPlayedClipId)
  }, [manifest, allProgress, lastPlayedClipId])

  const handleAnswer = useCallback(async (correct: boolean, responseTimeMs: number) => {
    const item = items[currentIndex]
    if (!item) return

    const exerciseType = item.exerciseType
    const rating = ratingFromOutcome(correct, responseTimeMs, exerciseType)

    // Update SRS
    const existingProgress = allProgress.get(item.targetSpecies.id) ?? createNewProgress(item.targetSpecies.id)
    const updated = scheduleReview({ ...existingProgress, introduced: true }, rating)
    await updateProgress(item.targetSpecies.id, updated)

    // Log confusion if incorrect
    if (!correct) {
      // For three_choice, we don't know which species was selected here
      // but we can log the target as needing practice
      await logConfusion(item.targetSpecies.id, 'unknown')
    }

    setAnswers(prev => [...prev, { species: item.targetSpecies, correct, rating }])

    if (currentIndex + 1 >= items.length) {
      setShowResults(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }, [items, currentIndex, allProgress, updateProgress, logConfusion])

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
    return <QuizResult answers={answers} onDone={onComplete} />
  }

  const currentItem = items[currentIndex]

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between">
        <button onClick={onComplete} className="text-sm text-text-muted">← Quit</button>
        <p className="text-sm text-text-muted">
          {currentIndex + 1} / {items.length}
        </p>
      </div>
      <div className="flex-1">
        {currentItem.exerciseType === 'three_choice' ? (
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
