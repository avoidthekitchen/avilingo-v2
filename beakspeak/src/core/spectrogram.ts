export interface SpectrogramData {
  magnitudes: Float32Array[]
  timeBins: number
  frequencyBins: number
  duration: number
  sampleRate: number
}

export function computeSpectrogram(
  buffer: AudioBuffer,
  options?: { fftSize?: number; hopSize?: number },
): SpectrogramData {
  const sampleRate = buffer.sampleRate
  const length = buffer.length

  if (length === 0) {
    return { magnitudes: [], timeBins: 0, frequencyBins: 0, duration: 0, sampleRate }
  }

  const fftSize = options?.fftSize ?? 1024
  const hopSize = options?.hopSize ?? fftSize / 2
  const frequencyBins = fftSize / 2
  const samples = buffer.getChannelData(0)
  const timeBins = Math.ceil(length / hopSize)

  const hannWindow = new Float32Array(fftSize)
  for (let i = 0; i < fftSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
  }

  const magnitudes: Float32Array[] = []
  let globalMax = 0

  for (let t = 0; t < timeBins; t++) {
    const offset = t * hopSize
    const real = new Float64Array(fftSize)
    const imag = new Float64Array(fftSize)

    for (let i = 0; i < fftSize; i++) {
      const sampleIdx = offset + i
      real[i] = (sampleIdx < length ? samples[sampleIdx] : 0) * hannWindow[i]
    }

    fft(real, imag)

    const mags = new Float32Array(frequencyBins)
    for (let i = 0; i < frequencyBins; i++) {
      mags[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i])
      if (mags[i] > globalMax) globalMax = mags[i]
    }
    magnitudes.push(mags)
  }

  if (globalMax > 0) {
    for (let t = 0; t < magnitudes.length; t++) {
      for (let i = 0; i < frequencyBins; i++) {
        magnitudes[t][i] /= globalMax
      }
    }
  }

  return {
    magnitudes,
    timeBins,
    frequencyBins,
    duration: buffer.duration,
    sampleRate,
  }
}

/** In-place radix-2 Cooley-Tukey FFT. Arrays must be power-of-2 length. */
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length
  if (n <= 1) return

  // Bit-reversal permutation
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp
    }
    let m = n >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }

  // Butterfly passes
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2
    const angle = -2 * Math.PI / size
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const theta = angle * k
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        const idx = i + k
        const idx2 = idx + halfSize
        const tReal = cos * real[idx2] - sin * imag[idx2]
        const tImag = sin * real[idx2] + cos * imag[idx2]
        real[idx2] = real[idx] - tReal
        imag[idx2] = imag[idx] - tImag
        real[idx] += tReal
        imag[idx] += tImag
      }
    }
  }
}
