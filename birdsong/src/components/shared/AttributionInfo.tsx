import { useState } from 'react'
import type { AudioClip, Photo } from '../../core/types'

interface Props {
  clip?: AudioClip
  photo?: Photo
}

export default function AttributionInfo({ clip, photo }: Props) {
  const [open, setOpen] = useState(false)

  if (!clip && !photo) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-6 h-6 rounded-full bg-text/10 text-text-muted text-xs flex items-center justify-center hover:bg-text/20 transition-colors"
        aria-label="Attribution info"
      >
        i
      </button>
      {open && (
        <div className="absolute bottom-8 right-0 bg-card border border-border rounded-lg shadow-lg p-3 text-xs text-left w-64 z-50">
          {clip && (
            <>
              <p className="font-medium">Recording by {clip.recordist}</p>
              <p className="text-text-muted">
                Xeno-canto{' '}
                <a
                  href={clip.xc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  XC{clip.xc_id}
                </a>
              </p>
              <p className="text-text-muted">{clip.location}</p>
              <p className="text-text-muted">{clip.license}</p>
            </>
          )}
          {photo && (
            <>
              <p className="font-medium">Photo from Wikipedia</p>
              <p className="text-text-muted">{photo.license}</p>
              <a
                href={photo.wikipedia_page}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Source
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
