import { useRef, useEffect, useCallback } from 'react'
import type { SpectrogramData } from '../../core/spectrogram'

interface Props {
  data: SpectrogramData
  currentTime: number
  duration: number
  isPlaying: boolean
  onSeek: (time: number) => void
}

// Dark-background color scheme: black → warm amber/yellow for loud frequencies
const BG_COLOR: [number, number, number] = [18, 18, 24]       // near-black with slight blue
const MID_COLOR: [number, number, number] = [139, 90, 43]     // warm brown
const HOT_COLOR: [number, number, number] = [255, 200, 60]    // bright amber
const PLAYHEAD_COLOR = '#5B8A72' // theme secondary (green)

function magnitudeToColor(mag: number): [number, number, number] {
  // Two-stop gradient: 0 → mid at 0.5, mid → hot at 1.0
  if (mag <= 0.5) {
    const t = mag * 2
    return [
      Math.round(BG_COLOR[0] + (MID_COLOR[0] - BG_COLOR[0]) * t),
      Math.round(BG_COLOR[1] + (MID_COLOR[1] - BG_COLOR[1]) * t),
      Math.round(BG_COLOR[2] + (MID_COLOR[2] - BG_COLOR[2]) * t),
    ]
  }
  const t = (mag - 0.5) * 2
  return [
    Math.round(MID_COLOR[0] + (HOT_COLOR[0] - MID_COLOR[0]) * t),
    Math.round(MID_COLOR[1] + (HOT_COLOR[1] - MID_COLOR[1]) * t),
    Math.round(MID_COLOR[2] + (HOT_COLOR[2] - MID_COLOR[2]) * t),
  ]
}

/**
 * Build a cached ImageData of the full heatmap. This is expensive but only
 * runs when `data` changes — NOT on every animation frame.
 */
function buildHeatmapImage(
  data: SpectrogramData,
  width: number,
  height: number,
): ImageData {
  const imageData = new ImageData(width, height)
  const pixels = imageData.data

  if (data.timeBins === 0 || width === 0 || height === 0) {
    // Fill with background color
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = BG_COLOR[0]
      pixels[i + 1] = BG_COLOR[1]
      pixels[i + 2] = BG_COLOR[2]
      pixels[i + 3] = 255
    }
    return imageData
  }

  for (let py = 0; py < height; py++) {
    // Map pixel row to frequency bin (low frequencies at bottom)
    const freqBin = Math.floor((1 - py / height) * data.frequencyBins)
    const clampedFreq = Math.min(freqBin, data.frequencyBins - 1)

    for (let px = 0; px < width; px++) {
      // Map pixel column to time bin
      const timeBin = Math.floor((px / width) * data.timeBins)
      const clampedTime = Math.min(timeBin, data.timeBins - 1)

      const mag = data.magnitudes[clampedTime][clampedFreq]
      const [r, g, b] = magnitudeToColor(mag)

      const idx = (py * width + px) * 4
      pixels[idx] = r
      pixels[idx + 1] = g
      pixels[idx + 2] = b
      pixels[idx + 3] = 255
    }
  }

  return imageData
}

export default function Spectrogram({ data, currentTime, duration, isPlaying: _isPlaying, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heatmapRef = useRef<ImageData | null>(null)
  const dimsRef = useRef({ width: 0, height: 0 })

  // Rebuild the cached heatmap when data or canvas size changes
  function ensureHeatmap(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    const pxWidth = Math.round(cssWidth * dpr)
    const pxHeight = Math.round(cssHeight * dpr)

    if (
      heatmapRef.current &&
      dimsRef.current.width === pxWidth &&
      dimsRef.current.height === pxHeight
    ) {
      return // cached heatmap is still valid
    }

    canvas.width = pxWidth
    canvas.height = pxHeight
    dimsRef.current = { width: pxWidth, height: pxHeight }
    heatmapRef.current = buildHeatmapImage(data, pxWidth, pxHeight)
  }

  // Fast per-frame draw: blit cached heatmap + draw playhead line
  function drawFrame(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ensureHeatmap(canvas)

    if (heatmapRef.current) {
      ctx.putImageData(heatmapRef.current, 0, 0)
    }

    // Draw playhead
    if (currentTime > 0 && duration > 0) {
      const playheadX = (currentTime / duration) * canvas.width
      ctx.strokeStyle = PLAYHEAD_COLOR
      ctx.lineWidth = 2 * (window.devicePixelRatio || 1)
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, canvas.height)
      ctx.stroke()
    }
  }

  // Invalidate cached heatmap when data changes
  useEffect(() => {
    heatmapRef.current = null
    const canvas = canvasRef.current
    if (canvas) drawFrame(canvas)
  }, [data])

  // Redraw playhead on progress updates (fast — just blit + line)
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawFrame(canvas)
  }, [currentTime, duration, data])

  // Handle resize — invalidate cache and redraw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      heatmapRef.current = null
      drawFrame(canvas)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [data, currentTime, duration])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || duration <= 0) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const seekTime = (x / rect.width) * duration
      onSeek(seekTime)
    },
    [duration, onSeek],
  )

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full cursor-pointer rounded"
      style={{ height: 80 }}
    />
  )
}
