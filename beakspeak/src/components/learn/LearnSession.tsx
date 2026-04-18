import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import { getSpeciesByIds } from '../../core/manifest'
import { buildIntroQuiz, buildReviewQuiz } from '../../core/lesson'
import type { Lesson } from '../../core/types'
import BirdCard from './BirdCard'
import IntroQuiz from './IntroQuiz'

type Phase = 'review' | 'cards' | 'quiz' | 'complete'

interface Props {
  lesson: Lesson
  onComplete: () => void
}

export default function LearnSession({ lesson, onComplete }: Props) {
  const manifest = useAppStore(s => s.manifest)
  const getIntroducedSpecies = useAppStore(s => s.getIntroducedSpecies)
  const introduceSpecies = useAppStore(s => s.introduceSpecies)

  const introducedSpecies = getIntroducedSpecies()
  const hasReviewPhase = introducedSpecies.length >= 3

  const [phase, setPhase] = useState<Phase>(hasReviewPhase ? 'review' : 'cards')
  const [cardIndex, setCardIndex] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)

  if (!manifest) return null

  const lessonSpecies = getSpeciesByIds(manifest, lesson.species)

  const handleSwipeRight = useCallback(() => {
    if (cardIndex < lessonSpecies.length - 1) {
      setSwipeDirection('right')
      setCardIndex(prev => prev + 1)
    } else {
      // All cards seen, move to quiz
      setPhase('quiz')
    }
  }, [cardIndex, lessonSpecies.length])

  const handleSwipeLeft = useCallback(() => {
    if (cardIndex > 0) {
      setSwipeDirection('left')
      setCardIndex(prev => prev - 1)
    }
  }, [cardIndex])

  const handleQuizComplete = useCallback(async () => {
    await introduceSpecies(lesson.species)
    setPhase('complete')
  }, [introduceSpecies, lesson.species])

  const handleReviewComplete = useCallback(() => {
    setPhase('cards')
  }, [])

  // Phase: forward testing review
  if (phase === 'review') {
    const reviewItems = buildReviewQuiz(introducedSpecies)
    if (reviewItems.length === 0) {
      setPhase('cards')
      return null
    }
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 bg-secondary/10 text-center">
          <p className="text-sm text-secondary font-medium">Quick Review</p>
          <p className="text-xs text-text-muted">Let's warm up with some familiar birds</p>
        </div>
        <IntroQuiz items={reviewItems} onComplete={handleReviewComplete} />
      </div>
    )
  }

  // Phase: swipeable card stack
  if (phase === 'cards') {
    const currentSpecies = lessonSpecies[cardIndex]
    if (!currentSpecies) return null

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 flex items-center justify-between">
          <button
            onClick={onComplete}
            className="text-sm text-text-muted"
          >
            ← Back
          </button>
          <p className="text-sm text-text-muted">
            {cardIndex + 1} / {lessonSpecies.length}
          </p>
        </div>

        <div className="flex-1 px-4 pb-4 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSpecies.id}
              initial={{
                x: swipeDirection === 'right' ? 300 : swipeDirection === 'left' ? -300 : 0,
                opacity: 0,
              }}
              animate={{ x: 0, opacity: 1 }}
              exit={{
                x: swipeDirection === 'right' ? -300 : 300,
                opacity: 0,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(_e, { offset, velocity }) => {
                const swipe = offset.x * velocity.x
                if (swipe > 10000 || offset.x > 100) {
                  handleSwipeRight()
                } else if (swipe < -10000 || offset.x < -100) {
                  handleSwipeLeft()
                }
              }}
              className="h-full"
            >
              <BirdCard species={currentSpecies} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Swipe hints */}
        <div className="px-4 pb-4 flex justify-between text-xs text-text-muted">
          {cardIndex > 0 ? (
            <button onClick={handleSwipeLeft} className="flex items-center gap-1">
              ← Previous
            </button>
          ) : (
            <span />
          )}
          <button onClick={handleSwipeRight} className="flex items-center gap-1">
            {cardIndex < lessonSpecies.length - 1 ? 'Next →' : 'Start Quiz →'}
          </button>
        </div>
      </div>
    )
  }

  // Phase: intro quiz
  if (phase === 'quiz') {
    const quizItems = buildIntroQuiz(lesson, lessonSpecies, introducedSpecies, manifest.species)
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 bg-primary/10 text-center">
          <p className="text-sm text-primary font-medium">Quick Quiz</p>
          <p className="text-xs text-text-muted">Test what you just learned!</p>
        </div>
        <IntroQuiz items={quizItems} onComplete={handleQuizComplete} />
      </div>
    )
  }

  // Phase: complete
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <p className="text-4xl mb-4">🎉</p>
      <h2 className="text-xl font-semibold text-text mb-2">Lesson Complete!</h2>
      <p className="text-text-muted mb-2">
        You've learned {lessonSpecies.map(s => s.common_name).join(', ')}
      </p>
      <p className="text-sm text-text-muted mb-6">
        They'll appear in your review sessions soon.
      </p>
      <button
        onClick={onComplete}
        className="px-6 py-3 bg-primary text-white rounded-full font-medium"
      >
        Continue
      </button>
    </div>
  )
}
