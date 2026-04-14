import { useState, useRef, useCallback, useMemo } from 'react';
import type { IntroQuizItem, ReviewQuizItem } from '../../core/types';
import { AudioButton } from '../shared/AudioButton';

type QuizItem = IntroQuizItem | ReviewQuizItem;

export function IntroQuiz({
  items,
  onComplete,
}: {
  items: QuizItem[];
  onComplete: (results: boolean[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const resultsRef = useRef<boolean[]>([]);
  const indexRef = useRef(0);

  const item = items[index];
  if (!item) {
    return null;
  }

  const choices = useMemo(
    () => [item.targetSpecies, ...item.distractors].sort(() => Math.random() - 0.5),
    [item.targetSpecies, item.distractors]
  );

  const advance = useCallback(() => {
    const curIndex = indexRef.current;
    const curResults = resultsRef.current;
    if (curIndex + 1 >= items.length) {
      onComplete(curResults);
    } else {
      indexRef.current = curIndex + 1;
      setIndex(curIndex + 1);
      setSelected(null);
      setAnswered(false);
    }
  }, [items.length, onComplete]);

  const handleSelect = (speciesId: string) => {
    if (answered) return;
    const correct = speciesId === item.targetSpecies.id;
    setSelected(speciesId);
    setAnswered(true);
    const newResults = [...resultsRef.current, correct];
    resultsRef.current = newResults;
    setResults(newResults);

    if (correct) {
      setTimeout(advance, 1500);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 pb-20">
      <div className="text-center mb-4">
        <p className="text-[var(--color-text-muted)] text-sm mb-2">
          Question {index + 1} of {items.length}
        </p>
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

      {answered && selected !== item.targetSpecies.id && (
        <div className="mt-4 text-center">
          <p className="text-sm text-[var(--color-error)] mb-2">
            The correct answer is {item.targetSpecies.common_name}
          </p>
          <button
            onClick={advance}
            className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium"
          >
            Next
          </button>
        </div>
      )}

      <div className="flex gap-1.5 justify-center mt-4">
        {items.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${
              i < results.length
                ? results[i]
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-error)]'
                : i === index
                ? 'bg-[var(--color-primary)]'
                : 'bg-[var(--color-bg-subtle)]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
