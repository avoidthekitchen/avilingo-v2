import { BoundedCache } from '../core/boundedCache'
import { computeSpectrogram } from '../core/spectrogram'
import type { SpectrogramData } from '../core/spectrogram'

// The identity key retains PCM too, so include it in this cache's budget.
const cache = new BoundedCache<AudioBuffer, SpectrogramData>(16 * 1024 * 1024, 8,
  (data, buffer) => buffer.length * buffer.numberOfChannels * 4 + data.magnitudes.reduce((bytes, row) => bytes + row.byteLength, 0))

export function getSpectrogram(buffer: AudioBuffer): SpectrogramData {
  const existing = cache.get(buffer)
  if (existing) return existing
  const data = computeSpectrogram(buffer)
  cache.set(buffer, data)
  return data
}
