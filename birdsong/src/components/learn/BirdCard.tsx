import type { Species } from '../../core/types';
import { AudioButton } from '../shared/AudioButton';
import { AttributionInfo } from '../shared/AttributionInfo';
import { motion } from 'framer-motion';

export function BirdCard({
  species,
  onSwipeNext,
  onSwipePrev,
  isFirst,
  isLast,
}: {
  species: Species;
  onSwipeNext: () => void;
  onSwipePrev: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-white rounded-2xl shadow-lg overflow-hidden"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x < -100) {
          onSwipeNext();
        } else if (info.offset.x > 100 && !isFirst) {
          onSwipePrev();
        }
      }}
    >
      <div className="relative h-[55%] bg-[var(--color-bg-subtle)]">
        {species.photo?.url && (
          <img
            src={species.photo.url}
            alt={species.common_name}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
          <h2 className="text-white text-2xl font-bold">{species.common_name}</h2>
        </div>
        <div className="absolute top-3 right-3">
          <AttributionInfo photo={species.photo} />
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
        <p className="text-[var(--color-text-muted)] italic text-sm">
          {species.scientific_name}
        </p>

        <div className="flex gap-2 flex-wrap">
          {species.audio_clips.songs.length > 0 && (
            <AudioButton clips={species.audio_clips.songs} label="Play Song" />
          )}
          {species.audio_clips.calls.length > 0 && (
            <AudioButton clips={species.audio_clips.calls} label="Play Call" />
          )}
        </div>

        <div className="bg-[var(--color-bg)] rounded-lg p-3">
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed italic">
            "{species.mnemonic}"
          </p>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {species.habitat.map((h) => (
            <span
              key={h}
              className="px-2.5 py-0.5 text-xs rounded-full bg-[var(--color-secondary-light)]/20 text-[var(--color-secondary-dark)]"
            >
              {h}
            </span>
          ))}
        </div>

        <div className="mt-auto flex justify-between items-center text-sm text-[var(--color-text-muted)] pt-2">
          {!isFirst && <span>← Previous</span>}
          <span className={isFirst ? '' : 'mx-auto'}>
            {isLast ? 'Tap → to start quiz' : 'Swipe → Next'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
