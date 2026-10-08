import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AudioButton from './AudioButton'
import type { AudioPlayer, AudioState } from '../../adapters/audio'
import type { AudioClip } from '../../core/types'

let audioPlayer: AudioPlayer
let activeUrl: string | null
let state: AudioState
let listeners: Array<(state: AudioState) => void>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      audioPlayer,
      lastPlayedClipId: new Map<string, string>(),
      setLastPlayedClip: vi.fn(),
    }),
}))

function makeClip(id: string): AudioClip {
  return {
    xc_id: id,
    xc_url: '',
    audio_url: `/${id}.ogg`,
    type: 'song',
    quality: 'A',
    length: '0:05',
    recordist: 'test',
    license: 'CC',
    location: '',
    country: '',
    score: 0,
  }
}

function emit(nextState: AudioState, url: string | null) {
  activeUrl = url
  state = nextState
  listeners.forEach(listener => listener(nextState))
}

describe('AudioButton', () => {
  beforeEach(() => {
    activeUrl = null
    state = 'idle'
    listeners = []
    audioPlayer = {
      play: vi.fn(async (url: string) => { emit('playing', url) }),
      stop: vi.fn(() => { emit('idle', null) }),
      seek: vi.fn(),
      isPlaying: vi.fn(() => state === 'playing'),
      getState: vi.fn(() => state),
      getActiveUrl: vi.fn(() => activeUrl),
      getProgress: vi.fn(() => ({ currentTime: 0, duration: 0 })),
      onStateChange: vi.fn((listener: (state: AudioState) => void) => {
        listeners.push(listener)
        return () => { listeners = listeners.filter(l => l !== listener) }
      }),
      onProgress: vi.fn(() => () => {}),
      prefetch: vi.fn(async () => null),
      getBuffer: vi.fn(() => null),
    }
  })

  it('stops its own clip when it unmounts', async () => {
    const { unmount } = render(
      <AudioButton clips={[makeClip('amro-song')]} label="Song" speciesId="amro" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Song' }))
    await vi.waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/amro-song.ogg'))
    expect(audioPlayer.stop).not.toHaveBeenCalled()

    unmount()

    expect(audioPlayer.stop).toHaveBeenCalledTimes(1)
  })

  it('leaves another clip playing when it unmounts', () => {
    const { unmount } = render(
      <AudioButton clips={[makeClip('amro-song')]} label="Song" speciesId="amro" />,
    )
    emit('playing', '/stja-call.ogg')

    unmount()

    expect(audioPlayer.stop).not.toHaveBeenCalled()
  })

  it('toggles between play and stop for its own clip', async () => {
    render(<AudioButton clips={[makeClip('amro-song')]} label="Song" speciesId="amro" />)

    const button = screen.getByRole('button', { name: 'Song' })
    fireEvent.click(button)
    await vi.waitFor(() => expect(button).toHaveTextContent('⏹'))

    fireEvent.click(button)
    expect(audioPlayer.stop).toHaveBeenCalledTimes(1)
    expect(button).toHaveTextContent('▶')
  })
})
