import type { Photo } from '../../core/types'
import ExternalLink from './ExternalLink'

export default function PhotoAttribution({ photo }: { photo: Photo }) {
  return (
    <div className="space-y-1 break-words">
      <p className="font-medium">
        {photo.creator ? `Photo by ${photo.creator}` : 'Photo from Wikipedia'}
      </p>
      {photo.creator && <p className="text-text-muted">{photo.filename.replaceAll('_', ' ')}</p>}
      <p className="text-text-muted">
        {photo.license_url ? (
          <ExternalLink href={photo.license_url} className="text-primary underline">
            {photo.license}
          </ExternalLink>
        ) : photo.license}
      </p>
      <ExternalLink href={photo.source_url ?? photo.wikipedia_page} className="text-primary underline">
        {photo.source_url ? 'Wikimedia Commons source' : 'Wikipedia source'}
      </ExternalLink>
    </div>
  )
}
