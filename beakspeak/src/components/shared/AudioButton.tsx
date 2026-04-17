import { useState, useCallback, useEffect } from 'react'
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

  const [displayState, setDisplayState] = useState<AudioState>('idle')
  const [clipIndex, setClipIndex] = useState(() => {
    const lastId = lastPlayedClipId.get(speciesId)
    if (!lastId) return 0
    const idx = clips.findIndex(c => c.xc_id === lastId)
    return idx >= 0 ? (idx + 1) % clips.length : 0
  })

  const clipUrls = clips.map(c => c.audio_url)

  // Subscribe to player state and derive display state from activeUrl
  useEffect(() => {
    const unsub = audioPlayer.onStateChange((state: AudioState) => {
      const activeUrl = audioPlayer.getActiveUrl()
      if (activeUrl && clipUrls.includes(activeUrl)) {
        setDisplayState(state)
        if (state === 'idle') {
          setClipIndex(prev => (prev + 1) % clips.length)
        }
      } else {
        setDisplayState('idle')
      }
    })
    return unsub
  }, [audioPlayer, clipUrls.join(','), clips.length])

  const currentClip = clips[clipIndex]
  if (!currentClip) return null

  const handlePlay = useCallback(async () => {
    if (displayState === 'playing') {
      audioPlayer.stop()
      return
    }

    const clip = clips[clipIndex]
    setLastPlayedClip(speciesId, clip.xc_id)
    await audioPlayer.play(clip.audio_url)
  }, [audioPlayer, clips, clipIndex, speciesId, setLastPlayedClip, displayState])

  const isPrimary = variant === 'primary'

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePlay}
        disabled={displayState === 'loading'}
        className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all ${
          isPrimary
            ? 'bg-primary text-white hover:bg-primary/90'
            : 'bg-border text-text hover:bg-border/80'
        } ${displayState === 'loading' ? 'opacity-60' : ''}`}
      >
        {displayState === 'loading' && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {displayState === 'playing' && <span>⏹</span>}
        {displayState !== 'loading' && displayState !== 'playing' && <span>▶</span>}
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
