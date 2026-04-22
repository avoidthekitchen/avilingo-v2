import { useState, useEffect, useCallback, useRef } from 'react'
import type { Species } from '../../core/types'
import type { SpectrogramData } from '../../core/spectrogram'
import { useAppStore } from '../../store/appStore'
import { computeSpectrogram } from '../../core/spectrogram'
import AudioButton from '../shared/AudioButton'
import AttributionInfo from '../shared/AttributionInfo'
import Spectrogram from '../shared/Spectrogram'

const EMPTY_SPECTROGRAM: SpectrogramData = {
  magnitudes: [], timeBins: 0, frequencyBins: 0, duration: 0, sampleRate: 44100,
}

interface Props {
  species: Species
}

export default function BirdCard({ species }: Props) {
  const audioPlayer = useAppStore(s => s.audioPlayer)

  const [activeClipType, setActiveClipType] = useState<'songs' | 'calls'>('songs')
  const [activeClipIndex, setActiveClipIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const activeClips = species.audio_clips[activeClipType]
  const activeClip = activeClips[activeClipIndex] ?? activeClips[0]
  const activeClipUrl = activeClip?.audio_url ?? null

  const [spectrogramCache, setSpectrogramCache] = useState(() => {
    const initialCache = new Map<string, SpectrogramData>()
    if (!activeClipUrl) return initialCache

    const buffer = audioPlayer.getBuffer(activeClipUrl)
    if (!buffer) return initialCache

    initialCache.set(activeClipUrl, computeSpectrogram(buffer))
    return initialCache
  })
  const spectrogramCacheRef = useRef(spectrogramCache)
  useEffect(() => {
    spectrogramCacheRef.current = spectrogramCache
  }, [spectrogramCache])

  const activeUrl = audioPlayer.getActiveUrl()
  const isPlaying = activeUrl != null && activeUrl === activeClipUrl

  // Keep a ref so the onStateChange callback always sees the latest activeClipUrl
  const activeClipUrlRef = useRef(activeClipUrl)
  useEffect(() => {
    activeClipUrlRef.current = activeClipUrl
  }, [activeClipUrl])

  const cacheSpectrogramForUrl = useCallback((url: string | null, buffer?: AudioBuffer | null) => {
    if (!url) return
    if (spectrogramCacheRef.current.has(url)) return

    const resolvedBuffer = buffer === undefined ? audioPlayer.getBuffer(url) : buffer
    if (!resolvedBuffer) return

    setSpectrogramCache(prev => {
      if (prev.has(url)) return prev

      const next = new Map(prev)
      next.set(url, computeSpectrogram(resolvedBuffer))
      return next
    })
  }, [audioPlayer])

  const spectrogramData = activeClipUrl == null
    ? EMPTY_SPECTROGRAM
    : spectrogramCache.get(activeClipUrl) ?? EMPTY_SPECTROGRAM
  const duration = spectrogramData.duration

  // Prefetch ALL clips on mount and pre-compute spectrograms as buffers settle
  useEffect(() => {
    const allUrls = [
      ...species.audio_clips.songs.map(c => c.audio_url),
      ...species.audio_clips.calls.map(c => c.audio_url),
    ]

    let cancelled = false

    for (const url of allUrls) {
      void audioPlayer.prefetch(url).then(buffer => {
        if (cancelled) return
        cacheSpectrogramForUrl(url, buffer)
      })
    }

    return () => { cancelled = true }
  }, [audioPlayer, cacheSpectrogramForUrl, species])

  // Track active clip type/index based on what the player is playing
  useEffect(() => {
    const unsub = audioPlayer.onStateChange((state) => {
      // Always reset playhead when idle (covers both explicit stop and natural end)
      if (state === 'idle') {
        setCurrentTime(0)
      }
      const url = audioPlayer.getActiveUrl()
      if (!url) return
      const songIdx = species.audio_clips.songs.findIndex(c => c.audio_url === url)
      if (songIdx >= 0) {
        setActiveClipType('songs')
        setActiveClipIndex(songIdx)
        cacheSpectrogramForUrl(url)
        return
      }
      const callIdx = species.audio_clips.calls.findIndex(c => c.audio_url === url)
      if (callIdx >= 0) {
        setActiveClipType('calls')
        setActiveClipIndex(callIdx)
        cacheSpectrogramForUrl(url)
      }
    })
    return unsub
  }, [audioPlayer, cacheSpectrogramForUrl, species])

  // Drive playhead via progress subscription
  useEffect(() => {
    const unsub = audioPlayer.onProgress((time) => {
      setCurrentTime(time)
    })
    return unsub
  }, [audioPlayer])

  // Stop playback when the card unmounts (e.g. ← Back button bypasses swipe handlers)
  useEffect(() => () => { audioPlayer.stop() }, [audioPlayer])

  const handleSeek = useCallback((time: number) => {
    const url = activeClipUrlRef.current
    if (!url) return
    if (audioPlayer.getActiveUrl() === url) {
      audioPlayer.seek(time)
    } else {
      audioPlayer.play(url, time)
    }
  }, [audioPlayer])

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm h-full flex flex-col">
      {/* Photo section */}
      <div className="relative" style={{ minHeight: '45%' }}>
        <img
          src={species.photo.url}
          alt={species.common_name}
          className="w-full h-full object-cover"
          style={{ maxHeight: '280px', minHeight: '200px' }}
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <h2 className="text-white text-xl font-bold">{species.common_name}</h2>
          <p className="text-white/80 text-sm italic">{species.scientific_name}</p>
        </div>
        <div className="absolute top-2 right-2">
          <AttributionInfo photo={species.photo} />
        </div>
      </div>

      {/* Info section */}
      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* Audio buttons */}
        <div className="flex flex-wrap gap-2">
          {species.audio_clips.songs.length > 0 && (
            <AudioButton
              clips={species.audio_clips.songs}
              label="Play Song"
              speciesId={species.id}
              variant="primary"
            />
          )}
          {species.audio_clips.calls.length > 0 && (
            <AudioButton
              clips={species.audio_clips.calls}
              label="Play Call"
              speciesId={species.id}
              variant="secondary"
            />
          )}
        </div>

        {/* Spectrogram */}
        <Spectrogram
          data={spectrogramData}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onSeek={handleSeek}
        />

        {/* Mnemonic */}
        <p className="text-sm text-text/80 italic leading-relaxed">
          "{species.mnemonic}"
        </p>

        {/* Habitat pills */}
        <div className="flex flex-wrap gap-1.5">
          {species.habitat.map(h => (
            <span
              key={h}
              className="text-xs px-2 py-0.5 bg-secondary/10 text-secondary rounded-full"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
