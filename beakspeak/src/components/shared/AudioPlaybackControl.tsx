import type { AudioPlayer } from '../../adapters/audio'
import { useAudioStateForUrl } from '../../hooks/useAudioStateForUrl'

interface Props {
  audioPlayer: AudioPlayer
  url: string
}

export default function AudioPlaybackControl({ audioPlayer, url }: Props) {
  const state = useAudioStateForUrl(audioPlayer, url)
  const isLoading = state === 'loading'
  const isPlaying = state === 'playing'
  const isError = state === 'error'

  const label = isLoading
    ? 'Loading sound…'
    : isPlaying
      ? 'Stop sound'
      : isError
        ? 'Tap to play sound'
        : 'Play sound'

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (isPlaying) {
            audioPlayer.stop()
          } else {
            audioPlayer.play(url).catch(() => {})
          }
        }}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-medium transition-all ${
          isLoading ? 'opacity-60' : ''
        }`}
      >
        {isLoading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {isPlaying && <span aria-hidden="true">⏹</span>}
        {!isLoading && !isPlaying && <span aria-hidden="true">▶</span>}
        {label}
      </button>
      {isError && (
        <p role="status" className="text-sm text-error text-center">
          Audio didn’t play. Tap to try again.
        </p>
      )}
    </div>
  )
}
