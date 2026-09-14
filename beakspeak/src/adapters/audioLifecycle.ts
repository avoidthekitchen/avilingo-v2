import type { AudioPlayer } from './audio'

interface LifecycleHandle {
  remove(): void | Promise<void>
}

interface NativeAppLifecycle {
  addListener(
    eventName: 'appStateChange',
    listener: (state: { isActive: boolean }) => void,
  ): Promise<LifecycleHandle>
}

export function stopAudioDuringInterruptions(
  audioPlayer: AudioPlayer,
  nativeLifecycle?: NativeAppLifecycle,
): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') audioPlayer.stop()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  let disposed = false
  let nativeHandle: LifecycleHandle | undefined

  void nativeLifecycle?.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) audioPlayer.stop()
  }).then(handle => {
    if (disposed) void handle?.remove()
    else nativeHandle = handle
  })

  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    void nativeHandle?.remove()
  }
}
