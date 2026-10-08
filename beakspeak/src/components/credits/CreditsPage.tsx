import { useAppStore } from '../../store/appStore'
import BirdPhoto from '../shared/BirdPhoto'
import ExternalLink from '../shared/ExternalLink'
import PhotoAttribution from '../shared/PhotoAttribution'

export default function CreditsPage() {
  const manifest = useAppStore(s => s.manifest)

  if (!manifest) return null

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-text mb-2">Credits & Attribution</h1>
      <p className="text-sm text-text-muted mb-6">
        Each recording and photo retains its own license, listed below.
      </p>

      <p className="text-sm text-text-muted mb-6">
        Recordings are trimmed and volume-normalized from the originals. Photos are
        displayed at reduced size; source pages retain any earlier cropping history.
      </p>

      <div className="space-y-6">
        {manifest.species.map(species => (
          <div key={species.id} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <BirdPhoto
                src={species.photo.url}
                srcSet={species.photo.srcset}
                alt={species.common_name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div>
                <h3 className="font-semibold text-text">{species.common_name}</h3>
                <p className="text-xs text-text-muted italic">{species.scientific_name}</p>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Photo
              </h4>
              <div className="text-xs"><PhotoAttribution photo={species.photo} /></div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Audio Recordings
              </h4>
              <div className="space-y-1">
                {[...species.audio_clips.songs, ...species.audio_clips.calls].map((clip, i) => (
                  <p key={`${clip.xc_id}-${i}`} className="text-xs text-text-muted">
                    {clip.recordist} ·{' '}
                    <ExternalLink
                      href={clip.xc_url}
                      className="text-primary underline"
                    >
                      XC{clip.xc_id}
                    </ExternalLink>{' '}
                    · {clip.type} ·{' '}
                    <ExternalLink href={clip.license} className="text-primary underline break-all">
                      {clip.license}
                    </ExternalLink>
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center text-xs text-text-muted pb-4">
        <p>BeakSpeak v{manifest.version}</p>
        <p>Audio from Xeno-canto · Photos from Wikimedia Commons</p>
      </div>
    </div>
  )
}
