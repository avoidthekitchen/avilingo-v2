import { useAppStore } from '../../store/appStore';

export function CreditsPage() {
  const manifest = useAppStore((s) => s.manifest);
  const setTab = useAppStore((s) => s.setTab);

  if (!manifest) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-3 border-b border-[var(--color-bg-subtle)]">
        <button onClick={() => setTab('learn')} className="text-sm text-[var(--color-text-muted)]">
          ← Back
        </button>
        <h1 className="flex-1 text-center font-semibold">Credits & Attribution</h1>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          All audio and images are used under their respective licenses. 
          Thank you to the recordists and photographers who make this app possible.
        </p>

        {manifest.species.map((sp) => (
          <div key={sp.id} className="mb-6 pb-6 border-b border-[var(--color-bg-subtle)]">
            <div className="flex items-center gap-3 mb-3">
              {sp.photo?.url && (
                <img
                  src={sp.photo.url}
                  alt={sp.common_name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
              )}
              <div>
                <h3 className="font-semibold">{sp.common_name}</h3>
                <p className="text-xs text-[var(--color-text-muted)] italic">
                  {sp.scientific_name}
                </p>
              </div>
            </div>

            <div className="ml-2 space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Audio Recordings
              </p>
              {[...sp.audio_clips.songs, ...sp.audio_clips.calls].map((clip) => (
                <div key={clip.xc_id} className="text-xs text-[var(--color-text-muted)] pl-2">
                  <p>
                    {clip.type} by {clip.recordist} —{' '}
                    <a
                      href={clip.xc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-secondary)] underline"
                    >
                      XC {clip.xc_id}
                    </a>
                  </p>
                  <p>{clip.location}</p>
                  <p>
                    <a
                      href={clip.license}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-secondary)] underline"
                    >
                      License
                    </a>
                  </p>
                </div>
              ))}

              {sp.wikipedia_audio && sp.wikipedia_audio.length > 0 && (
                <>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mt-3">
                    Wikipedia Audio
                  </p>
                  {sp.wikipedia_audio.map((wa, i) => (
                    <div key={i} className="text-xs text-[var(--color-text-muted)] pl-2">
                      <p>
                        <a
                          href={wa.commons_page}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-secondary)] underline"
                        >
                          {wa.filename}
                        </a>
                      </p>
                      <p>{wa.license}</p>
                    </div>
                  ))}
                </>
              )}

              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mt-3">
                Photo
              </p>
              <div className="text-xs text-[var(--color-text-muted)] pl-2">
                <p>
                  Source: {sp.photo.source} — {sp.photo.license}
                </p>
                <p>
                  <a
                    href={sp.photo.wikipedia_page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-secondary)] underline"
                  >
                    Wikipedia page
                  </a>
                </p>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-4 pt-4 border-t border-[var(--color-bg-subtle)] text-center text-xs text-[var(--color-text-muted)]">
          <p>Birdsong v{manifest.version}</p>
          <p className="mt-1">{manifest.region}</p>
          <p className="mt-1">{manifest.target_species_count} species — Tier {manifest.tier}</p>
        </div>
      </div>
    </div>
  );
}
