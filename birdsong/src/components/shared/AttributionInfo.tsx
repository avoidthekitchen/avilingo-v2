import { useState } from 'react';
import type { Photo } from '../../core/types';

export function AttributionInfo({ photo }: { photo: Photo }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShow(!show)}
        className="text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text)]"
        title="Photo attribution"
      >
        (i)
      </button>
      {show && (
        <div className="absolute top-full right-0 mt-1 bg-white shadow-lg rounded-lg p-3 text-xs text-[var(--color-text-muted)] z-50 w-56 border border-[var(--color-bg-subtle)]">
          <p>Photo: {photo.source}</p>
          <p className="mt-1">{photo.license}</p>
          <p className="mt-1">
            <a href={photo.wikipedia_page} target="_blank" rel="noopener noreferrer" className="text-[var(--color-secondary)] underline">
              Wikipedia
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
