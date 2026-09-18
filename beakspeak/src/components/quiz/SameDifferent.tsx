import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { playAudioToCompletion } from '../../adapters/audio'
import type { QuizItem } from '../../core/types'
import BirdPhoto from '../shared/BirdPhoto'
import FeedbackAnnouncement from '../shared/FeedbackAnnouncement'

interface Props {
  item: QuizItem
  // chosenId names the species the learner confused the target with: the second
  // clip's species when they called a pair "same", or the target itself when they
  // failed to recognise two clips of one bird.
  onAnswer: (correct: boolean, responseTimeMs: number, chosenId: string) => void
}

type PlayPhase = 'clip1' | 'pause' | 'clip2' | 'ready' | 'answered'

export default function SameDifferent({ item, onAnswer }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const [playPhase, setPlayPhase] = useState<PlayPhase | 'blocked'>('clip1')
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null)
  const startTime = useRef(0)
  const sequenceId = useRef(0)
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playSequence = useCallback(async () => {
    const sequenceRequestId = sequenceId.current + 1
    sequenceId.current = sequenceRequestId
    audioPlayer.stop()

    try {
      setPlayPhase('clip1')
      await playAudioToCompletion(audioPlayer, item.clip.audio_url)
      if (sequenceId.current !== sequenceRequestId) return

      setPlayPhase('pause')
      await new Promise(resolve => setTimeout(resolve, 1500))
      if (sequenceId.current !== sequenceRequestId) return

      if (item.secondClip) {
        setPlayPhase('clip2')
        await playAudioToCompletion(audioPlayer, item.secondClip.audio_url)
        if (sequenceId.current !== sequenceRequestId) return
      }

      setPlayPhase('ready')
      startTime.current = Date.now()
    } catch {
      if (sequenceId.current === sequenceRequestId) setPlayPhase('blocked')
    }
  }, [audioPlayer, item])

  // Play the two clips sequentially with 1.5s pause
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void playSequence()
    })
    return () => {
      cancelled = true
      sequenceId.current += 1
      if (autoAdvanceRef.current !== null) clearTimeout(autoAdvanceRef.current)
      audioPlayer.stop()
    }
  }, [audioPlayer, playSequence])

  useEffect(() => {
    const cancelHiddenSequence = () => {
      const sequenceIsActive = playPhase === 'clip1' || playPhase === 'pause' || playPhase === 'clip2'
      if (document.visibilityState !== 'hidden' || !sequenceIsActive) return

      sequenceId.current += 1
      audioPlayer.stop()
      setPlayPhase('blocked')
    }

    document.addEventListener('visibilitychange', cancelHiddenSequence)
    return () => document.removeEventListener('visibilitychange', cancelHiddenSequence)
  }, [audioPlayer, playPhase])

  const handleAnswer = useCallback((answeredSame: boolean) => {
    if (playPhase !== 'ready') return

    const responseTime = Date.now() - startTime.current
    const correct = answeredSame === item.isSame
    setSelectedAnswer(answeredSame)
    setPlayPhase('answered')

    if (correct) {
      autoAdvanceRef.current = setTimeout(() => onAnswer(true, responseTime, item.targetSpecies.id), 1500)
    }
  }, [playPhase, item.isSame, item.targetSpecies.id, onAnswer])

  const handleNext = useCallback(() => {
    const responseTime = Date.now() - startTime.current
    onAnswer(false, responseTime, item.secondSpecies?.id ?? item.targetSpecies.id)
  }, [onAnswer, item.secondSpecies?.id, item.targetSpecies.id])

  const isCorrect = selectedAnswer === item.isSame
  const isAnswered = playPhase === 'answered'

  return (
    <div className="p-4 flex flex-col h-full">
      <FeedbackAnnouncement
        message={isAnswered ? (isCorrect ? 'Correct!' : 'Incorrect') : ''}
      />
      {/* Clip indicator */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className={`w-3 h-3 rounded-full transition-colors ${
            playPhase === 'clip1' ? 'bg-primary animate-pulse' : 'bg-border'
          }`} />
          <span className="text-xs text-text-muted">
            {playPhase === 'clip1' ? 'Clip 1 of 2' :
             playPhase === 'pause' ? 'Listen...' :
             playPhase === 'clip2' ? 'Clip 2 of 2' :
             playPhase === 'blocked' ? 'Playback needs a tap' :
             'Your turn'}
          </span>
          <div className={`w-3 h-3 rounded-full transition-colors ${
            playPhase === 'clip2' ? 'bg-primary animate-pulse' : 'bg-border'
          }`} />
        </div>

        <button
          type="button"
          onClick={() => { void playSequence() }}
          disabled={playPhase !== 'ready' && playPhase !== 'blocked'}
          className="px-4 py-2 text-sm text-primary underline"
        >
          {playPhase === 'blocked' ? 'Tap to play both clips' : 'Replay both clips'}
        </button>
        {playPhase === 'blocked' && (
          <p role="status" className="mt-2 text-sm text-error">
            Audio didn’t play. Tap to try both clips again.
          </p>
        )}
      </div>

      <p className="text-lg font-semibold text-text text-center mb-6">
        Same species or different?
      </p>

      {/* Answer buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => handleAnswer(true)}
          disabled={playPhase !== 'ready'}
          className={`flex-1 py-4 rounded-xl border-2 font-medium text-lg transition-all ${
            isAnswered && selectedAnswer === true
              ? item.isSame ? 'border-success bg-success/10 text-success' : 'border-error bg-error/10 text-error'
              : isAnswered && item.isSame === true
              ? 'border-success bg-success/10 text-success'
              : playPhase === 'ready'
              ? 'border-border bg-card text-text hover:border-primary'
              : 'border-border/50 bg-border/30 text-text-muted'
          }`}
        >
          Same
        </button>
        <button
          onClick={() => handleAnswer(false)}
          disabled={playPhase !== 'ready'}
          className={`flex-1 py-4 rounded-xl border-2 font-medium text-lg transition-all ${
            isAnswered && selectedAnswer === false
              ? !item.isSame ? 'border-success bg-success/10 text-success' : 'border-error bg-error/10 text-error'
              : isAnswered && item.isSame === false
              ? 'border-success bg-success/10 text-success'
              : playPhase === 'ready'
              ? 'border-border bg-card text-text hover:border-primary'
              : 'border-border/50 bg-border/30 text-text-muted'
          }`}
        >
          Different
        </button>
      </div>

      {/* Feedback */}
      {isAnswered && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className={`font-medium text-center ${isCorrect ? 'text-success' : 'text-error'}`}>
            {isCorrect ? 'Correct!' : 'Incorrect'}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="text-center">
              <BirdPhoto
                src={item.targetSpecies.photo.url}
                alt={item.targetSpecies.common_name}
                className="w-12 h-12 rounded-lg object-cover mx-auto mb-1"
              />
              <p className="text-xs text-text font-medium">{item.targetSpecies.common_name}</p>
            </div>
            {item.secondSpecies && item.secondSpecies.id !== item.targetSpecies.id && (
              <>
                <span className="text-text-muted">≠</span>
                <div className="text-center">
                  <BirdPhoto
                    src={item.secondSpecies.photo.url}
                    alt={item.secondSpecies.common_name}
                    className="w-12 h-12 rounded-lg object-cover mx-auto mb-1"
                  />
                  <p className="text-xs text-text font-medium">{item.secondSpecies.common_name}</p>
                </div>
              </>
            )}
          </div>
          {!isCorrect && (
            <div className="flex justify-center mt-3">
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
