import { useState, useRef, useEffect } from 'react';
import type { AudioClip } from '../../core/types';
import { useAppStore } from '../../store/appStore';
import { getRecordistAttribution } from '../../core/manifest';

export function AudioButton({
  clips,
  label,
  autoPlay = false,
}: {
  clips: AudioClip[];
  label: string;
  autoPlay?: boolean;
}) {
  const audioPlayer = useAppStore((s) => s.audioPlayer);
  const setLastPlayedClip = useAppStore((s) => s.setLastPlayedClip);
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAttrib, setShowAttrib] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    audioPlayer.onStateChange = (isPlaying) => {
      if (mountedRef.current) setPlaying(isPlaying);
    };
  }, [audioPlayer]);

  useEffect(() => {
    if (autoPlay && clips.length > 0) {
      handlePlay();
    }
  }, [autoPlay]);

  const handlePlay = async () => {
    if (clips.length === 0) return;
    const clip = clips[clipIndex];
    setLoading(true);
    setPlaying(false);
    try {
      await audioPlayer.play(clip.audio_url);
      setLastPlayedClip(clip.xc_id.split('_')[0], clip.xc_id);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleStop = () => {
    audioPlayer.stop();
  };

  const handleClick = () => {
    if (playing) {
      handleStop();
    } else {
      const nextIndex = playing ? (clipIndex + 1) % clips.length : clipIndex;
      setClipIndex(nextIndex);
      handlePlay();
    }
  };

  const currentClip = clips[clipIndex];

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={clips.length === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : playing ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        <span>{label}</span>
        {clips.length > 1 && (
          <span className="text-xs opacity-75">({clipIndex + 1}/{clips.length})</span>
        )}
      </button>
      {currentClip && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAttrib(!showAttrib); }}
          className="ml-2 text-[var(--color-text-muted)] text-sm hover:text-[var(--color-text)]"
          title="Attribution"
        >
          (i)
        </button>
      )}
      {showAttrib && currentClip && (
        <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-lg p-3 text-xs text-[var(--color-text-muted)] z-50 w-64 border border-[var(--color-bg-subtle)]">
          <p>{getRecordistAttribution(currentClip)}</p>
          <p className="mt-1">{currentClip.location}</p>
          <p className="mt-1"><a href={currentClip.license} target="_blank" rel="noopener noreferrer" className="text-[var(--color-secondary)] underline">License</a></p>
        </div>
      )}
    </div>
  );
}
