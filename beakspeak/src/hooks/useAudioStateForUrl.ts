import { useCallback, useSyncExternalStore } from 'react'
import type { AudioPlayer, AudioState } from '../adapters/audio'

/**
 * Track the player's state, but only when the given URL is the active clip.
 * Returns 'idle' whenever a different clip is active.
 */
export function useAudioStateForUrl(audioPlayer: AudioPlayer, url: string): AudioState {
  const getSnapshot = useCallback(
    (): AudioState => (audioPlayer.getActiveUrl() === url ? audioPlayer.getState() : 'idle'),
    [audioPlayer, url],
  )
  const subscribe = useCallback(
    (onStoreChange: () => void) => audioPlayer.onStateChange(() => onStoreChange()),
    [audioPlayer],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
