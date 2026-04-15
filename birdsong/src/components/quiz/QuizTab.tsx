import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import QuizSession from './QuizSession'

export default function QuizTab() {
  const getIntroducedSpecies = useAppStore(s => s.getIntroducedSpecies)
  const getDueForReview = useAppStore(s => s.getDueForReview)
  const hasRelearning = useAppStore(s => s.hasRelearning)
  const setTab = useAppStore(s => s.setTab)
  const [inSession, setInSession] = useState(false)

  const introduced = getIntroducedSpecies()
  const dueForReview = getDueForReview()
  const relearning = hasRelearning()

  if (inSession) {
    return <QuizSession onComplete={() => setInSession(false)} />
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
            onClick={() => setInSession(true)}
            className="px-6 py-3 bg-primary text-white rounded-full font-medium"
          >
            Start Review
          </button>
        </>
      ) : (
        <>
          <p className="text-text-muted mb-4">No birds due for review right now.</p>
          {relearning ? (
            <p className="text-sm text-error/80">
              Some birds need more practice. Come back when they're due.
            </p>
          ) : (
            <button
              onClick={() => setTab('learn')}
              className="px-6 py-3 bg-secondary text-white rounded-full font-medium"
            >
              Learn More Birds
            </button>
          )}
        </>
      )}
    </div>
  )
}
