import { useState } from 'react'
import { getLessons } from '../../core/manifest'
import { getNextLesson, isLessonAvailable } from '../../core/lesson'
import { useAppStore } from '../../store/appStore'
import QuizSession from './QuizSession'

export default function QuizTab() {
  const manifest = useAppStore(s => s.manifest)
  const allProgress = useAppStore(s => s.allProgress)
  const getCompletedLessons = useAppStore(s => s.getCompletedLessons)
  const getIntroducedSpecies = useAppStore(s => s.getIntroducedSpecies)
  const getDueForReview = useAppStore(s => s.getDueForReview)
  const hasRelearning = useAppStore(s => s.hasRelearning)
  const setTab = useAppStore(s => s.setTab)
  const [sessionMode, setSessionMode] = useState<'review' | 'practice' | null>(null)

  if (!manifest) return null

  const introduced = getIntroducedSpecies()
  const dueForReview = getDueForReview()
  const relearning = hasRelearning()
  const completedLessons = getCompletedLessons()
  const lessons = getLessons(manifest)
  const nextLesson = getNextLesson(lessons, completedLessons)
  const allLessonsComplete = nextLesson === null
  const guidedPathAvailable = nextLesson !== null
    && isLessonAvailable(nextLesson.lesson, completedLessons, allProgress)
  const practiceAvailable = introduced.length >= 3 && dueForReview.length === 0

  if (sessionMode) {
    return <QuizSession mode={sessionMode} onComplete={() => setSessionMode(null)} />
  }

  if (introduced.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-4xl mb-4">🐦</p>
        <h2 className="text-xl font-semibold text-text mb-2">No birds learned yet</h2>
        <p className="text-text-muted mb-6">Start by learning some birds first!</p>
        <button
          onClick={() => setTab('learn')}
          className="px-6 py-3 bg-primary text-white rounded-full font-medium"
        >
          Start Learning
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <p className="text-4xl mb-4">🎯</p>
      <h2 className="text-xl font-semibold text-text mb-2">Quiz</h2>

      {dueForReview.length > 0 ? (
        <>
          <p className="text-text-muted mb-6">
            {dueForReview.length} bird{dueForReview.length !== 1 ? 's' : ''} due for review
          </p>
          <button
            onClick={() => setSessionMode('review')}
            className="px-6 py-3 bg-primary text-white rounded-full font-medium"
          >
            Start Review
          </button>
        </>
      ) : (
        <>
          <p className="text-text-muted mb-4">No birds due for review right now.</p>
          {relearning ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-error/80">
                Some birds need more practice. Come back when they're due.
              </p>
              {practiceAvailable && (
                <button
                  onClick={() => setSessionMode('practice')}
                  className="px-6 py-3 bg-primary text-white rounded-full font-medium"
                >
                  Practice Anyway
                </button>
              )}
            </div>
          ) : allLessonsComplete ? (
            practiceAvailable ? (
              <button
                onClick={() => setSessionMode('practice')}
                className="px-6 py-3 bg-primary text-white rounded-full font-medium"
              >
                Practice Anyway
              </button>
            ) : null
          ) : guidedPathAvailable ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setTab('learn')}
                className="px-6 py-3 bg-secondary text-white rounded-full font-medium"
              >
                Learn More Birds
              </button>
              {practiceAvailable && (
                <button
                  onClick={() => setSessionMode('practice')}
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Practice Anyway
                </button>
              )}
            </div>
          ) : practiceAvailable ? (
            <button
              onClick={() => setSessionMode('practice')}
              className="px-6 py-3 bg-primary text-white rounded-full font-medium"
            >
              Practice Anyway
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
