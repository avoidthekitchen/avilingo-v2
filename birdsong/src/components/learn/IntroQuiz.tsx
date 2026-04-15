import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import type { IntroQuizItem } from '../../core/types'

interface Props {
  items: IntroQuizItem[]
  onComplete: (results: Array<{ correct: boolean }>) => void
}

export default function IntroQuiz({ items, onComplete }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ correct: boolean }>>([])
  const [showingResult, setShowingResult] = useState(false)

  const current = items[currentIndex]

  // Auto-play clip when question appears
  useEffect(() => {
    if (current && !showingResult) {
      audioPlayer.play(current.clip.audio_url).catch(() => {})
    }
  }, [currentIndex, current, audioPlayer, showingResult])

  const handleSelect = useCallback((speciesId: string) => {
    if (showingResult || !current) return

    const correct = speciesId === current.targetSpecies.id
    setSelectedId(speciesId)
    setShowingResult(true)
    setResults(prev => [...prev, { correct }])

    if (correct) {
      // Auto-advance after 1.5s for correct answers
      setTimeout(() => advance(), 1500)
    }
  }, [showingResult, current])

  const advance = useCallback(() => {
    if (currentIndex + 1 >= items.length) {
      onComplete([...results])
      return
    }
    setCurrentIndex(prev => prev + 1)
    setSelectedId(null)
    setShowingResult(false)
  }, [currentIndex, items.length, onComplete, results])

  if (!current) return null

  const isCorrect = selectedId === current.targetSpecies.id

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="text-center mb-4">
        <p className="text-xs text-text-muted mb-2">
          Question {currentIndex + 1} of {items.length}
        </p>
        <button
          onClick={() => audioPlayer.play(current.clip.audio_url)}
          className="px-6 py-3 bg-primary text-white rounded-full font-medium"
        >
          ▶ Play Sound
        </button>
      </div>

      <p className="text-lg font-semibold text-text text-center mb-4">
        Which bird is this?
      </p>

      {/* 3-choice vertical stack */}
      <div className="space-y-3 flex-1">
        {current.choices.map(choice => {
          let borderColor = 'border-border'
          let bg = 'bg-card'

          if (showingResult) {
            if (choice.id === current.targetSpecies.id) {
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

      {/* Feedback */}
      {showingResult && (
        <div className="mt-4 p-4 rounded-xl border border-border bg-card">
          {isCorrect ? (
            <p className="text-success font-medium text-center">Correct!</p>
          ) : (
            <p className="text-error font-medium text-center">
              That was {current.targetSpecies.common_name}
            </p>
          )}
          <p className="text-sm text-text-muted text-center mt-1 italic">
            "{current.targetSpecies.mnemonic}"
          </p>
          {!isCorrect && (
            <div className="flex justify-center mt-3 gap-2">
              <button
                onClick={() => audioPlayer.play(current.clip.audio_url)}
                className="text-sm text-primary underline"
              >
                Play correct sound
              </button>
              <button
                onClick={advance}
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
