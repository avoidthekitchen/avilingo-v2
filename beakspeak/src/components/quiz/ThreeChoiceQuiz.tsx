import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { playAudioToCompletion } from '../../adapters/audio'
import type { QuizItem } from '../../core/types'
import AudioPlaybackControl from '../shared/AudioPlaybackControl'
import BirdPhoto from '../shared/BirdPhoto'
import FeedbackAnnouncement from '../shared/FeedbackAnnouncement'

interface Props {
  item: QuizItem
  // chosenId is the species the learner picked; it lets a wrong answer be logged as
  // a confusion between two specific birds.
  onAnswer: (correct: boolean, responseTimeMs: number, chosenId: string) => void
}

export default function ThreeChoiceQuiz({ item, onAnswer }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showingResult, setShowingResult] = useState(false)
  // Response time is measured from the end of the first playback (or from the moment
  // playback fails or is stopped), so the grade reflects recall rather than how long
  // the clip was. Answering before the clip ends counts as an immediate recall.
  const startTime = useRef<number | null>(null)
  useEffect(() => {
    let cancelled = false
    startTime.current = null
    const markReady = () => {
      if (!cancelled && startTime.current === null) startTime.current = Date.now()
    }
    playAudioToCompletion(audioPlayer, item.clip.audio_url).then(markReady, markReady)
    return () => { cancelled = true }
  }, [item, audioPlayer])

  const responseTimeMs = useCallback(
    () => (startTime.current === null ? 0 : Date.now() - startTime.current),
    [],
  )

  // Stop audio and cancel a pending auto-advance when the question unmounts
  // (quit/complete/navigate), so a quit inside the 1.5 s window records nothing.
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current !== null) clearTimeout(autoAdvanceRef.current)
      audioPlayer.stop()
    }
  }, [audioPlayer])

  const handleSelect = useCallback((speciesId: string) => {
    if (showingResult) return

    const responseTime = responseTimeMs()
    const correct = speciesId === item.targetSpecies.id
    setSelectedId(speciesId)
    setShowingResult(true)

    if (correct) {
      autoAdvanceRef.current = setTimeout(() => onAnswer(true, responseTime, speciesId), 1500)
    }
    // For incorrect, user must tap "Next"
  }, [showingResult, item, onAnswer, responseTimeMs])

  const handleNext = useCallback(() => {
    onAnswer(false, responseTimeMs(), selectedId ?? item.targetSpecies.id)
  }, [onAnswer, responseTimeMs, selectedId, item.targetSpecies.id])

  if (!item.choices) return null

  const isCorrect = selectedId === item.targetSpecies.id

  return (
    <div className="p-4 flex flex-col h-full">
      <FeedbackAnnouncement
        message={showingResult ? (isCorrect ? 'Correct!' : `That was ${item.targetSpecies.common_name}`) : ''}
      />
      <div className="text-center mb-4">
        <AudioPlaybackControl audioPlayer={audioPlayer} url={item.clip.audio_url} />
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
              <BirdPhoto
                src={choice.photo.url}
                alt=""
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
                onClick={() => audioPlayer.play(item.clip.audio_url).catch(() => {})}
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
