import { describe, it, expect } from 'vitest'
import { computeSpectrogram } from './spectrogram'

function makeAudioBuffer(samples: Float32Array, sampleRate: number) {
  return {
    getChannelData: () => samples,
    length: samples.length,
    duration: samples.length / sampleRate,
    sampleRate,
    numberOfChannels: 1,
  } as unknown as AudioBuffer
}

describe('computeSpectrogram', () => {
  it('produces correct output shape for given sample count', () => {
    const sampleRate = 44100
    const samples = new Float32Array(4096)
    const buffer = makeAudioBuffer(samples, sampleRate)
    const result = computeSpectrogram(buffer)

    // defaults: fftSize=1024, hopSize=512
    expect(result.frequencyBins).toBe(512)
    expect(result.timeBins).toBe(Math.ceil(4096 / 512))
    expect(result.magnitudes).toHaveLength(result.timeBins)
    expect(result.magnitudes[0]).toHaveLength(512)
    expect(result.duration).toBe(4096 / sampleRate)
    expect(result.sampleRate).toBe(sampleRate)
  })

  it('detects a 440Hz sine wave at the correct frequency bin', () => {
    const sampleRate = 44100
    const duration = 0.5 // 22050 samples
    const numSamples = Math.round(sampleRate * duration)
    const samples = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate)
    }
    const buffer = makeAudioBuffer(samples, sampleRate)
    const fftSize = 1024
    const result = computeSpectrogram(buffer, { fftSize })

    // Expected peak bin: 440 * fftSize / sampleRate ≈ 10.2
    const expectedBin = Math.round(440 * fftSize / sampleRate)

    // Find the bin with the highest magnitude in the middle time frame
    const midFrame = result.magnitudes[Math.floor(result.timeBins / 2)]
    let peakBin = 0
    let peakValue = 0
    for (let i = 0; i < midFrame.length; i++) {
      if (midFrame[i] > peakValue) {
        peakValue = midFrame[i]
        peakBin = i
      }
    }

    expect(peakBin).toBe(expectedBin)
    expect(peakValue).toBeGreaterThan(0.5)

    // Bins far from the peak should be much quieter
    const farBin = Math.min(expectedBin + 50, result.frequencyBins - 1)
    expect(midFrame[farBin]).toBeLessThan(0.1)
  })

  it('produces near-zero magnitudes for silence', () => {
    const samples = new Float32Array(2048) // all zeros
    const buffer = makeAudioBuffer(samples, 44100)
    const result = computeSpectrogram(buffer)

    for (const frame of result.magnitudes) {
      for (let i = 0; i < frame.length; i++) {
        expect(frame[i]).toBeLessThan(0.01)
      }
    }
  })

  it('respects custom fftSize option', () => {
    const samples = new Float32Array(4096)
    const buffer = makeAudioBuffer(samples, 44100)
    const result = computeSpectrogram(buffer, { fftSize: 2048 })

    expect(result.frequencyBins).toBe(1024)
    expect(result.magnitudes[0]).toHaveLength(1024)
    // hopSize defaults to fftSize/2 = 1024
    expect(result.timeBins).toBe(Math.ceil(4096 / 1024))
  })

  it('returns empty data for a zero-length buffer', () => {
    const buffer = makeAudioBuffer(new Float32Array(0), 44100)
    const result = computeSpectrogram(buffer)

    expect(result.magnitudes).toEqual([])
    expect(result.timeBins).toBe(0)
    expect(result.frequencyBins).toBe(0)
    expect(result.duration).toBe(0)
    expect(result.sampleRate).toBe(44100)
  })
})
