import { useId, useState } from 'react'
import type { AudioClip, Photo } from '../../core/types'
import ExternalLink from './ExternalLink'
import PhotoAttribution from './PhotoAttribution'

interface Props {
  clip?: AudioClip
  photo?: Photo
}

export default function AttributionInfo({ clip, photo }: Props) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()

  if (!clip && !photo) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-text shadow-sm transition-colors hover:bg-bg"
        aria-label="Attribution info"
        aria-expanded={open}
        aria-controls={detailsId}
      >
        i
      </button>
      {open && (
        <div id={detailsId} className="absolute top-12 right-0 bg-card border border-border rounded-lg shadow-lg p-3 text-xs text-left w-64 z-50">
          {clip && (
            <>
              <p className="font-medium">Recording by {clip.recordist}</p>
              <p className="text-text-muted">
                Xeno-canto{' '}
                <ExternalLink
                  href={clip.xc_url}
                  className="text-primary underline"
                >
                  XC{clip.xc_id}
                </ExternalLink>
              </p>
              <p className="text-text-muted">{clip.location}</p>
              <p className="text-text-muted">{clip.license}</p>
            </>
          )}
          {photo && <PhotoAttribution photo={photo} />}
        </div>
      )}
    </div>
  )
}
