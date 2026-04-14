import { useState, useRef, useEffect, useMemo } from 'react';
import type { QuizItem, Species } from '../../core/types';
import { useAppStore } from '../../store/appStore';

export function SameDifferent({
  item,
  onAnswer,
}: {
  item: QuizItem;
  onAnswer: (correct: boolean, responseTimeMs: number) => void;
}) {
  const audioPlayer = useAppStore((s) => s.audioPlayer);
  const manifest = useAppStore((s) => s.manifest);
  const [phase, setPhase] = useState<'playing1' | 'gap' | 'playing2' | 'answering'>('playing1');
  const [selected, setSelected] = useState<boolean | null>(null);
  const [answered, setAnswered] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const secondSpecies: Species | undefined = useMemo(() => {
    if (item.isSame || !item.secondClip || !manifest) return item.targetSpecies;
    return manifest.species.find(
      (s) =>
        s.audio_clips.songs.some((c) => c.audio_url === item.secondClip!.audio_url) ||
        s.audio_clips.calls.some((c) => c.audio_url === item.secondClip!.audio_url)
    );
  }, [item.isSame, item.secondClip, manifest, item.targetSpecies]);

  useEffect(() => {
    playSequence();
    return () => {
      audioPlayer.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const playSequence = async () => {
    setPhase('playing1');
    await audioPlayer.play(item.clip.audio_url);

    setPhase('gap');
    await new Promise<void>((resolve) => {
      timerRef.current = window.setTimeout(() => resolve(), 1500);
    });

    setPhase('playing2');
    if (item.secondClip) {
      await audioPlayer.play(item.secondClip.audio_url);
    }

    setPhase('answering');
    startTimeRef.current = Date.now();
  };

  const handleAnswer = (same: boolean) => {
    if (answered) return;
    const responseTime = Date.now() - startTimeRef.current;
    const correct = same === item.isSame;
    setSelected(same);
    setAnswered(true);
    onAnswer(correct, responseTime);
  };

  const clipLabel = phase === 'playing1' ? 'Clip 1 of 2' : phase === 'playing2' ? 'Clip 2 of 2' : '';

  return (
    <div className="flex flex-col h-full p-4">
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-subtle)] rounded-full">
          <div className={`w-2 h-2 rounded-full ${
            phase === 'playing1' ? 'bg-[var(--color-primary)] animate-pulse' : 'bg-[var(--color-text-muted)]'
          }`} />
          <span className="text-sm text-[var(--color-text-muted)]">{clipLabel || 'Ready'}</span>
          <div className={`w-2 h-2 rounded-full ${
            phase === 'playing2' ? 'bg-[var(--color-primary)] animate-pulse' : 'bg-[var(--color-text-muted)]'
          }`} />
        </div>
      </div>

      <p className="text-center text-lg font-medium mb-8">Same species or different?</p>

      <div className="flex gap-4 justify-center mb-6">
        <button
          onClick={() => handleAnswer(true)}
          disabled={phase !== 'answering' && !answered}
          className={`flex-1 max-w-[180px] py-6 rounded-2xl border-2 text-lg font-bold transition-all ${
            answered && selected === true
              ? item.isSame
                ? 'bg-[var(--color-success-light)] border-[var(--color-success)] text-[var(--color-success)]'
                : 'bg-[var(--color-error-light)] border-[var(--color-error)] text-[var(--color-error)]'
              : 'bg-white border-[var(--color-bg-subtle)] hover:border-[var(--color-primary)] active:scale-[0.98]'
          } ${phase !== 'answering' && !answered ? 'opacity-50' : ''}`}
        >
          Same
        </button>
        <button
          onClick={() => handleAnswer(false)}
          disabled={phase !== 'answering' && !answered}
          className={`flex-1 max-w-[180px] py-6 rounded-2xl border-2 text-lg font-bold transition-all ${
            answered && selected === false
              ? !item.isSame
                ? 'bg-[var(--color-success-light)] border-[var(--color-success)] text-[var(--color-success)]'
                : 'bg-[var(--color-error-light)] border-[var(--color-error)] text-[var(--color-error)]'
              : 'bg-white border-[var(--color-bg-subtle)] hover:border-[var(--color-primary)] active:scale-[0.98]'
          } ${phase !== 'answering' && !answered ? 'opacity-50' : ''}`}
        >
          Different
        </button>
      </div>

      {answered && secondSpecies && (
        <div className="mt-auto p-4 bg-[var(--color-bg)] rounded-xl">
          <div className="flex gap-4">
            <div className="flex-1 text-center">
              {item.targetSpecies.photo?.url && (
                <img
                  src={item.targetSpecies.photo.url}
                  alt={item.targetSpecies.common_name}
                  className="w-16 h-16 rounded-lg object-cover mx-auto mb-1"
                />
              )}
              <p className="text-xs font-medium">{item.targetSpecies.common_name}</p>
            </div>
            <div className="flex-1 text-center">
              {secondSpecies.photo?.url && (
                <img
                  src={secondSpecies.photo.url}
                  alt={secondSpecies.common_name}
                  className="w-16 h-16 rounded-lg object-cover mx-auto mb-1"
                />
              )}
              <p className="text-xs font-medium">{secondSpecies.common_name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
