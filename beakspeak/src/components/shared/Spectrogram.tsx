import { useRef, useEffect, useCallback } from 'react'
import type { SpectrogramData } from '../../core/spectrogram'

interface Props {
  data: SpectrogramData
  currentTime: number
  duration: number
  isPlaying: boolean
  onSeek: (time: number) => void
}

const FALLBACK_BG = '#FAF8F5'
const FALLBACK_PRIMARY = '#8B6F47'
const FALLBACK_SECONDARY = '#5B8A72'

function parseHexColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function getThemeColor(prop: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || fallback
}

function drawSpectrogram(
  canvas: HTMLCanvasElement,
  data: SpectrogramData,
  currentTime: number,
  duration: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const cssWidth = canvas.clientWidth
  const cssHeight = canvas.clientHeight
  canvas.width = cssWidth * dpr
  canvas.height = cssHeight * dpr
  ctx.scale(dpr, dpr)

  const bgColor = parseHexColor(getThemeColor('--color-bg', FALLBACK_BG))
  const primaryColor = parseHexColor(getThemeColor('--color-primary', FALLBACK_PRIMARY))
  const secondaryHex = getThemeColor('--color-secondary', FALLBACK_SECONDARY)

  // Empty data — flat gray canvas
  if (data.timeBins === 0) {
    ctx.fillStyle = `rgb(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]})`
    ctx.fillRect(0, 0, cssWidth, cssHeight)
    return
  }

  // Draw heatmap
  const colWidth = cssWidth / data.timeBins
  const rowHeight = cssHeight / data.frequencyBins

  for (let t = 0; t < data.timeBins; t++) {
    const mags = data.magnitudes[t]
    const x = t * colWidth
    for (let f = 0; f < data.frequencyBins; f++) {
      // Low frequencies at bottom: invert the y-axis
      const y = (data.frequencyBins - 1 - f) * rowHeight
      const mag = mags[f]
      const [r, g, b] = lerpColor(bgColor, primaryColor, mag)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(x, y, Math.ceil(colWidth), Math.ceil(rowHeight))
    }
  }

  // Draw playhead
  if (currentTime > 0 && duration > 0) {
    const playheadX = (currentTime / duration) * cssWidth
    ctx.strokeStyle = secondaryHex
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, cssHeight)
    ctx.stroke()
  }
}

export default function Spectrogram({ data, currentTime, duration, isPlaying: _isPlaying, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Draw heatmap when data changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawSpectrogram(canvas, data, currentTime, duration)
  }, [data])

  // Redraw playhead on progress updates
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawSpectrogram(canvas, data, currentTime, duration)
  }, [currentTime, duration, data])

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => {
      drawSpectrogram(canvas, data, currentTime, duration)
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
