import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import type { IntroQuizItem } from '../../core/types'
import AudioPlaybackControl from '../shared/AudioPlaybackControl'
import BirdPhoto from '../shared/BirdPhoto'
import FeedbackAnnouncement from '../shared/FeedbackAnnouncement'

interface Props {
  items: IntroQuizItem[]
  onComplete: (results: Array<{ correct: boolean }>) => void
  onBack?: () => void
}

export default function IntroQuiz({ items, onComplete, onBack }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ correct: boolean }>>([])
  const [showingResult, setShowingResult] = useState(false)
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = items[currentIndex]
  const clearAutoAdvanceTimeout = useCallback(() => {
    if (autoAdvanceTimeoutRef.current !== null) {
      clearTimeout(autoAdvanceTimeoutRef.current)
      autoAdvanceTimeoutRef.current = null
    }
  }, [])

  // Auto-play clip when question appears
  useEffect(() => {
    if (current && !showingResult) {
      audioPlayer.play(current.clip.audio_url).catch(() => {})
    }
  }, [currentIndex, current, audioPlayer, showingResult])

  // Stop audio when leaving the quiz
  useEffect(() => {
    return () => {
      clearAutoAdvanceTimeout()
      audioPlayer.stop()
    }
  }, [audioPlayer, clearAutoAdvanceTimeout])

  const advance = useCallback(() => {
    if (currentIndex + 1 >= items.length) {
      onComplete([...results])
      return
    }
    setCurrentIndex(prev => prev + 1)
    setSelectedId(null)
    setShowingResult(false)
  }, [currentIndex, items.length, onComplete, results])

  const handleSelect = useCallback((speciesId: string) => {
    if (showingResult || !current) return

    const correct = speciesId === current.targetSpecies.id
    setSelectedId(speciesId)
    setShowingResult(true)
    setResults(prev => [...prev, { correct }])

    if (correct) {
      // Auto-advance after 1.5s for correct answers
      clearAutoAdvanceTimeout()
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        autoAdvanceTimeoutRef.current = null
        advance()
      }, 1500)
    }
  }, [advance, clearAutoAdvanceTimeout, showingResult, current])

  const handleBack = useCallback(() => {
    clearAutoAdvanceTimeout()
    onBack?.()
  }, [clearAutoAdvanceTimeout, onBack])

  const feedbackRef = useRef<HTMLDivElement>(null)
  const isCorrect = !current || selectedId === current.targetSpecies.id
  const feedbackMessage = !showingResult
    ? ''
    : isCorrect
      ? 'Correct!'
      : `That was ${current?.targetSpecies.common_name ?? ''}`

  useEffect(() => {
    if (showingResult && !isCorrect && feedbackRef.current) {
      feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [showingResult, isCorrect])

  if (!current) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <FeedbackAnnouncement message={feedbackMessage} />
      <div className="p-4 flex flex-col flex-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          {onBack ? (
            <button
              onClick={handleBack}
              className="text-sm text-text-muted"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <p className="text-xs text-text-muted">
            Question {currentIndex + 1} of {items.length}
          </p>
          <span />
        </div>

        <div className="text-center mb-4">
          <AudioPlaybackControl audioPlayer={audioPlayer} url={current.clip.audio_url} />
        </div>

        <p className="text-lg font-semibold text-text text-center mb-4">
          Which bird is this?
        </p>

        {/* 3-choice vertical stack */}
        <div className="space-y-3">
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
                <BirdPhoto
                  src={choice.photo.url}
                  alt={choice.common_name}
                  className="w-14 h-14 rounded-lg object-cover"
                />
                <span className="font-medium text-text">{choice.common_name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Feedback - pinned to bottom */}
      {showingResult && (
        <div
          ref={feedbackRef}
          className="sticky bottom-0 p-4 border-t border-border bg-bg"
        >
          <div className="p-3 rounded-xl border border-border bg-card">
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
                  onClick={() => audioPlayer.play(current.clip.audio_url).catch(() => {})}
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
        </div>
      )}
    </div>
  )
}
