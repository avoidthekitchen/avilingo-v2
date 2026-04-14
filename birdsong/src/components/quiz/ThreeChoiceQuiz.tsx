import { useState, useRef, useMemo } from 'react';
import type { QuizItem } from '../../core/types';
import { AudioButton } from '../shared/AudioButton';

export function ThreeChoiceQuiz({
  item,
  onAnswer,
}: {
  item: QuizItem;
  onAnswer: (correct: boolean, responseTimeMs: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const startTimeRef = useRef(Date.now());

  const choices = useMemo(
    () => [item.targetSpecies, ...item.distractors].sort(() => Math.random() - 0.5),
    [item.targetSpecies, item.distractors]
  );

  const handleSelect = (speciesId: string) => {
    if (answered) return;
    const responseTime = Date.now() - startTimeRef.current;
    const correct = speciesId === item.targetSpecies.id;
    setSelected(speciesId);
    setAnswered(true);
    onAnswer(correct, responseTime);
  };

  return (
    <div className="flex flex-col h-full p-4 pb-20">
      <div className="text-center mb-4">
        <AudioButton clips={[item.clip]} label="Play Sound" autoPlay />
      </div>

      <p className="text-center text-lg font-medium mb-4">Which bird is this?</p>

      <div className="flex flex-col gap-3 flex-1">
        {choices.map((sp) => {
          let bgClass = 'bg-white border-[var(--color-bg-subtle)]';
          if (answered) {
            if (sp.id === item.targetSpecies.id) {
              bgClass = 'bg-[var(--color-success-light)] border-[var(--color-success)]';
            } else if (sp.id === selected) {
              bgClass = 'bg-[var(--color-error-light)] border-[var(--color-error)]';
            }
          }

          return (
            <button
              key={sp.id}
              onClick={() => handleSelect(sp.id)}
              disabled={answered}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${bgClass} ${
                !answered ? 'hover:border-[var(--color-primary)] active:scale-[0.98]' : ''
              }`}
            >
              {sp.photo?.url && (
                <img
                  src={sp.photo.url}
                  alt={sp.common_name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              )}
              <div className="text-left">
                <p className="font-medium text-sm">{sp.common_name}</p>
                {answered && sp.id === item.targetSpecies.id && (
                  <p className="text-xs text-[var(--color-success)] italic mt-0.5">
                    "{item.targetSpecies.mnemonic}"
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
