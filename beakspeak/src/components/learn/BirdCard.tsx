import type { Species } from '../../core/types'
import AudioButton from '../shared/AudioButton'
import AttributionInfo from '../shared/AttributionInfo'

interface Props {
  species: Species
}

export default function BirdCard({ species }: Props) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm h-full flex flex-col">
      {/* Photo section - top 60% */}
      <div className="relative" style={{ minHeight: '55%' }}>
        <img
          src={species.photo.url}
          alt={species.common_name}
          className="w-full h-full object-cover"
          style={{ maxHeight: '350px', minHeight: '250px' }}
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <h2 className="text-white text-xl font-bold">{species.common_name}</h2>
        </div>
        <div className="absolute top-2 right-2">
          <AttributionInfo photo={species.photo} />
        </div>
      </div>

      {/* Info section */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <p className="text-sm text-text-muted italic">{species.scientific_name}</p>

        {/* Audio buttons */}
        <div className="flex flex-wrap gap-2">
          {species.audio_clips.songs.length > 0 && (
            <AudioButton
              clips={species.audio_clips.songs}
              label="Play Song"
              speciesId={species.id}
              variant="primary"
            />
          )}
          {species.audio_clips.calls.length > 0 && (
            <AudioButton
              clips={species.audio_clips.calls}
              label="Play Call"
              speciesId={species.id}
              variant="secondary"
            />
          )}
        </div>

        {/* Mnemonic */}
        <p className="text-sm text-text/80 italic leading-relaxed">
          "{species.mnemonic}"
        </p>

        {/* Habitat pills */}
        <div className="flex flex-wrap gap-1.5">
          {species.habitat.map(h => (
            <span
              key={h}
              className="text-xs px-2 py-0.5 bg-secondary/10 text-secondary rounded-full"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
