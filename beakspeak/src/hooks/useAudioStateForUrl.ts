import { useState, useEffect } from 'react'
import type { AudioPlayer, AudioState } from '../adapters/audio'

/**
 * Track the player's state, but only when the given URL is the active clip.
 * Returns 'idle' whenever a different clip is active.
 */
export function useAudioStateForUrl(audioPlayer: AudioPlayer, url: string): AudioState {
  const [state, setState] = useState<AudioState>(() =>
    audioPlayer.getActiveUrl() === url ? audioPlayer.getState() : 'idle',
  )
  useEffect(() => {
    // Re-sync on url change — useState initializer only runs once on mount
    setState(audioPlayer.getActiveUrl() === url ? audioPlayer.getState() : 'idle')
    const unsub = audioPlayer.onStateChange((s) => {
      const activeUrl = audioPlayer.getActiveUrl()
      setState(activeUrl === url ? s : 'idle')
    })
    return unsub
  }, [audioPlayer, url])
  return state
}
