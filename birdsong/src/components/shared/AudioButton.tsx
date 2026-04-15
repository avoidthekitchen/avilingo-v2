import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import type { AudioClip } from '../../core/types'
import type { AudioState } from '../../adapters/audio'
import AttributionInfo from './AttributionInfo'

interface Props {
  clips: AudioClip[]
  label: string
  speciesId: string
  variant?: 'primary' | 'secondary'
}

export default function AudioButton({ clips, label, speciesId, variant = 'primary' }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)
  const lastPlayedClipId = useAppStore(s => s.lastPlayedClipId)
  const setLastPlayedClip = useAppStore(s => s.setLastPlayedClip)

  const [audioState, setAudioState] = useState<AudioState>('idle')
  const [clipIndex, setClipIndex] = useState(() => {
    const lastId = lastPlayedClipId.get(speciesId)
    if (!lastId) return 0
    const idx = clips.findIndex(c => c.xc_id === lastId)
    return idx >= 0 ? (idx + 1) % clips.length : 0
  })
  const unsubRef = useRef<(() => void) | null>(null)

  // Clean up listener on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  const currentClip = clips[clipIndex]
  if (!currentClip) return null

  const handlePlay = useCallback(async () => {
    if (audioState === 'playing') {
      audioPlayer.stop()
      setAudioState('idle')
      return
    }

    const clip = clips[clipIndex]
    setLastPlayedClip(speciesId, clip.xc_id)

    // Clean up previous listener
    if (unsubRef.current) unsubRef.current()

    // Set up state listener
    unsubRef.current = audioPlayer.onStateChange((state: AudioState) => {
      setAudioState(state)
      if (state === 'idle') {
        setClipIndex(prev => (prev + 1) % clips.length)
      }
    })

    await audioPlayer.play(clip.audio_url)
  }, [audioPlayer, clips, clipIndex, speciesId, setLastPlayedClip, audioState])

  const isPrimary = variant === 'primary'

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePlay}
        disabled={audioState === 'loading'}
        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${
          isPrimary
            ? 'bg-primary text-white hover:bg-primary/90'
            : 'bg-border text-text hover:bg-border/80'
        } ${audioState === 'loading' ? 'opacity-60' : ''}`}
      >
        {audioState === 'loading' && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {audioState === 'playing' && <span>⏹</span>}
        {audioState !== 'loading' && audioState !== 'playing' && <span>▶</span>}
        {label}
        {clips.length > 1 && (
          <span className="text-xs opacity-70">
            {clipIndex + 1}/{clips.length}
          </span>
        )}
      </button>
      <AttributionInfo clip={currentClip} />
    </div>
  )
}
