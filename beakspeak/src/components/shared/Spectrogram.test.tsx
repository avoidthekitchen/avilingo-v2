import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Spectrogram from './Spectrogram'
import type { SpectrogramData } from '../../core/spectrogram'

function makeSpectrogramData(timeBins = 10, frequencyBins = 512): SpectrogramData {
  const magnitudes: Float32Array[] = []
  for (let t = 0; t < timeBins; t++) {
    magnitudes.push(new Float32Array(frequencyBins))
  }
  return { magnitudes, timeBins, frequencyBins, duration: 5.0, sampleRate: 44100 }
}

describe('Spectrogram', () => {
  it('renders a canvas element', () => {
    const data = makeSpectrogramData()
    const { container } = render(
      <Spectrogram data={data} currentTime={0} duration={5} isPlaying={false} onSeek={() => {}} />,
    )
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })

  it('calls onSeek with proportional time when clicked at 75% of width', () => {
    const data = makeSpectrogramData()
    const onSeek = vi.fn()
    const { container } = render(
      <Spectrogram data={data} currentTime={0} duration={12} isPlaying={false} onSeek={onSeek} />,
    )
    const canvas = container.querySelector('canvas')!

    // Simulate canvas having a known position and width
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 80, width: 400, height: 80, x: 0, y: 0, toJSON() {} })

    fireEvent.click(canvas, { clientX: 300 })

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(9) // 300/400 * 12 = 9
  })

  it('renders without error when data has zero time bins', () => {
    const emptyData: SpectrogramData = {
      magnitudes: [],
      timeBins: 0,
      frequencyBins: 0,
      duration: 0,
      sampleRate: 44100,
    }
    const { container } = render(
      <Spectrogram data={emptyData} currentTime={0} duration={0} isPlaying={false} onSeek={() => {}} />,
    )
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })

  it('does not fire onSeek when duration is zero', () => {
    const emptyData: SpectrogramData = {
      magnitudes: [],
      timeBins: 0,
      frequencyBins: 0,
      duration: 0,
      sampleRate: 44100,
    }
    const onSeek = vi.fn()
    const { container } = render(
      <Spectrogram data={emptyData} currentTime={0} duration={0} isPlaying={false} onSeek={onSeek} />,
    )
    const canvas = container.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 80, width: 400, height: 80, x: 0, y: 0, toJSON() {} })

    fireEvent.click(canvas, { clientX: 200 })

    expect(onSeek).not.toHaveBeenCalled()
  })
})
