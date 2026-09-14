import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioPlayer, AudioState } from './audio'
import { stopAudioDuringInterruptions } from './audioLifecycle'

function makePlayer(): AudioPlayer {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    seek: vi.fn(),
    isPlaying: vi.fn(() => true),
    getState: vi.fn((): AudioState => 'playing'),
    getActiveUrl: vi.fn(() => '/song.ogg'),
    getProgress: vi.fn(() => ({ currentTime: 0, duration: 10 })),
    onStateChange: vi.fn(() => () => {}),
    onProgress: vi.fn(() => () => {}),
    prefetch: vi.fn(async () => null),
    getBuffer: vi.fn(() => null),
  }
}

describe('stopAudioDuringInterruptions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stops playback when the app moves to the background', () => {
    const player = makePlayer()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const cleanup = stopAudioDuringInterruptions(player)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(player.stop).toHaveBeenCalledOnce()
    cleanup()
  })

  it('does not restart or stop playback when the app returns to the foreground', () => {
    const player = makePlayer()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const cleanup = stopAudioDuringInterruptions(player)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(player.stop).not.toHaveBeenCalled()
    expect(player.play).not.toHaveBeenCalled()
    cleanup()
  })

  it('stops playback when the native app becomes inactive', async () => {
    const player = makePlayer()
    let onAppStateChange: ((state: { isActive: boolean }) => void) | undefined
    const remove = vi.fn()
    const nativeLifecycle = {
      addListener: vi.fn(async (_event: 'appStateChange', listener: typeof onAppStateChange) => {
        onAppStateChange = listener
        return { remove }
      }),
    }

    const cleanup = stopAudioDuringInterruptions(player, nativeLifecycle)
    await Promise.resolve()
    onAppStateChange?.({ isActive: false })

    expect(player.stop).toHaveBeenCalledOnce()
    onAppStateChange?.({ isActive: true })
    expect(player.play).not.toHaveBeenCalled()

    cleanup()
    expect(remove).toHaveBeenCalledOnce()
  })
})
