import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AudioPlayer, AudioState } from '../../adapters/audio'
import AudioPlaybackControl from './AudioPlaybackControl'

function makePlayer(state: AudioState): AudioPlayer {
  const url = '/content/audio/song.ogg'
  return {
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    seek: vi.fn(),
    isPlaying: vi.fn(() => state === 'playing'),
    getState: vi.fn(() => state),
    getActiveUrl: vi.fn(() => url),
    getProgress: vi.fn(() => ({ currentTime: 0, duration: 0 })),
    onStateChange: vi.fn(() => () => {}),
    onProgress: vi.fn(() => () => {}),
    prefetch: vi.fn(async () => null),
    getBuffer: vi.fn(() => null),
  }
}

describe('AudioPlaybackControl', () => {
  it('offers an immediate tap-to-play recovery after playback is blocked', () => {
    const player = makePlayer('error')

    render(<AudioPlaybackControl audioPlayer={player} url="/content/audio/song.ogg" />)

    expect(screen.getByText('Audio didn’t play. Tap to try again.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Tap to play sound' })
    expect(retry).toBeEnabled()

    fireEvent.click(retry)
    expect(player.play).toHaveBeenCalledWith('/content/audio/song.ogg')
  })

  it('lets the learner stop active playback', () => {
    const player = makePlayer('playing')

    render(<AudioPlaybackControl audioPlayer={player} url="/content/audio/song.ogg" />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop sound' }))

    expect(player.stop).toHaveBeenCalledOnce()
  })
})
