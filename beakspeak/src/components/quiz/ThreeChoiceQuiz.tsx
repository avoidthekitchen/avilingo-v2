import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import type { QuizItem } from '../../core/types'

interface Props {
  item: QuizItem
  onAnswer: (correct: boolean, responseTimeMs: number) => void
}

export default function ThreeChoiceQuiz({ item, onAnswer }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showingResult, setShowingResult] = useState(false)
  const startTime = useRef(Date.now())

  // Auto-play clip on mount
  useEffect(() => {
    startTime.current = Date.now()
    audioPlayer.play(item.clip.audio_url).catch(() => {})
  }, [item, audioPlayer])

  const handleSelect = useCallback((speciesId: string) => {
    if (showingResult) return

    const responseTime = Date.now() - startTime.current
    const correct = speciesId === item.targetSpecies.id
    setSelectedId(speciesId)
    setShowingResult(true)

    if (correct) {
      setTimeout(() => onAnswer(true, responseTime), 1500)
    }
    // For incorrect, user must tap "Next"
  }, [showingResult, item, onAnswer])

  const handleNext = useCallback(() => {
    const responseTime = Date.now() - startTime.current
    onAnswer(false, responseTime)
  }, [onAnswer])

  if (!item.choices) return null

  const isCorrect = selectedId === item.targetSpecies.id

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="text-center mb-4">
        <button
          onClick={() => audioPlayer.play(item.clip.audio_url)}
          className="px-6 py-3 bg-primary text-white rounded-full font-medium"
        >
          ▶ Play Sound
        </button>
      </div>

      <p className="text-lg font-semibold text-text text-center mb-4">
        Which bird is this?
      </p>

      <div className="space-y-3 flex-1">
        {item.choices.map(choice => {
          let borderColor = 'border-border'
          let bg = 'bg-card'

          if (showingResult) {
            if (choice.id === item.targetSpecies.id) {
              borderColor = 'border-success'
              bg = 'bg-success/10'
            } else if (choice.id === selectedId) {
              borderColor = 'border-error'
              bg = 'bg-error/10'
            }
          }

          return (
            <button
              key={choice.id}
              onClick={() => handleSelect(choice.id)}
              disabled={showingResult}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${borderColor} ${bg}`}
            >
              <img
                src={choice.photo.url}
                alt={choice.common_name}
                className="w-14 h-14 rounded-lg object-cover"
              />
              <span className="font-medium text-text">{choice.common_name}</span>
            </button>
          )
        })}
      </div>

      {showingResult && (
        <div className="mt-4 p-4 rounded-xl border border-border bg-card">
          {isCorrect ? (
            <p className="text-success font-medium text-center">Correct!</p>
          ) : (
            <p className="text-error font-medium text-center">
              That was {item.targetSpecies.common_name}
            </p>
          )}
          <p className="text-sm text-text-muted text-center mt-1 italic">
            "{item.targetSpecies.mnemonic}"
          </p>
          {!isCorrect && (
            <div className="flex justify-center mt-3 gap-2">
              <button
                onClick={() => audioPlayer.play(item.clip.audio_url)}
                className="text-sm text-primary underline"
              >
                Play correct sound
              </button>
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-primary text-white rounded-full text-sm font-medium"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
