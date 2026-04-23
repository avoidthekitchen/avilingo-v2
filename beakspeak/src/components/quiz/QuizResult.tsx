import type { Species } from '../../core/types'

interface QuizAnswer {
  species: Species
  correct: boolean
  rating: number
}

interface Props {
  answers: QuizAnswer[]
  mode: 'review' | 'practice'
  onDone: () => void
}

export default function QuizResult({ answers, mode, onDone }: Props) {
  const correctCount = answers.filter(a => a.correct).length
  const total = answers.length
  const needsPractice = answers.filter(a => !a.correct)

  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="text-center mb-6">
        <p className="text-5xl mb-4">
          {percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : '💪'}
        </p>
        <h2 className="text-2xl font-bold text-text">
          {correctCount} / {total}
        </h2>
        <p className="text-text-muted">
          {percentage}% correct
        </p>
        {mode === 'practice' && (
          <p className="text-sm text-text-muted mt-2">
            This practice session didn&apos;t change your review schedule.
          </p>
        )}
      </div>

      {needsPractice.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-2">
            Needs More Practice
          </h3>
          <div className="space-y-2">
            {needsPractice.map((a, index) => (
              <div
                key={`${a.species.id}-${index}`}
                className="flex items-center gap-3 p-3 bg-error/5 border border-error/20 rounded-xl"
              >
                <img
                  src={a.species.photo.url}
                  alt={a.species.common_name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
                <div>
                  <p className="font-medium text-text text-sm">{a.species.common_name}</p>
                  <p className="text-xs text-text-muted italic">"{a.species.mnemonic}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto">
        <button
          onClick={onDone}
          className="w-full py-3 bg-primary text-white rounded-xl font-medium"
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}
