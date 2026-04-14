import { useState, useRef } from 'react';
import type { QuizItem } from '../../core/types';
import { ThreeChoiceQuiz } from './ThreeChoiceQuiz';
import { SameDifferent } from './SameDifferent';
import { QuizResult } from './QuizResult';
import { useAppStore } from '../../store/appStore';
import { scheduleReview, ratingFromOutcome, ratingFromOutcomeSameDifferent } from '../../core/fsrs';
import { buildQuizSession, countDue } from '../../core/quiz';
import { getInTierConfuserPairs } from '../../core/manifest';
import { AnimatePresence, motion } from 'framer-motion';
import type { Grade } from 'ts-fsrs';

export function QuizSession() {
  const manifest = useAppStore((s) => s.manifest);
  const allProgress = useAppStore((s) => s.allProgress);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const logConfusion = useAppStore((s) => s.logConfusion);
  const lastPlayedClipId = useAppStore((s) => s.lastPlayedClipId);
  const setTab = useAppStore((s) => s.setTab);
  const initializedSpecies = useAppStore((s) => s.initializedSpecies);

  const [items] = useState<QuizItem[]>(() => {
    if (!manifest) return [];
    const confuserPairs = getInTierConfuserPairs(manifest);
    const introduced = initializedSpecies();
    return buildQuizSession(allProgress, introduced, confuserPairs, lastPlayedClipId);
  });

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [againSpecies, setAgainSpecies] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const startTimeRef = useRef(Date.now());

  if (!manifest || items.length === 0) return null;

  const handleAnswer = async (correct: boolean, responseTimeMs: number) => {
    const item = items[index];
    const progress = allProgress.get(item.targetSpecies.id);
    if (!progress) return;

    const rating: Grade = item.exerciseType === 'same_different'
      ? ratingFromOutcomeSameDifferent(correct, responseTimeMs)
      : ratingFromOutcome(correct, responseTimeMs);

    const updated = scheduleReview(progress, rating);
    await updateProgress(item.targetSpecies.id, updated);

    if (!correct) {
      setAgainSpecies((prev) =>
        prev.includes(item.targetSpecies.common_name)
          ? prev
          : [...prev, item.targetSpecies.common_name]
      );
      await logConfusion(item.targetSpecies.id, item.targetSpecies.id);
    }

    setResults((prev) => [...prev, correct]);
  };

  const handleAdvance = () => {
    if (index + 1 >= items.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      startTimeRef.current = Date.now();
    }
  };

  if (done) {
    const dueNow = countDue(allProgress);
    return (
      <QuizResult
        results={results}
        againSpecies={againSpecies}
        nextReviewCount={dueNow}
        onClose={() => setTab('quiz')}
      />
    );
  }

  const item = items[index];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-bg-subtle)]">
        <span className="text-sm text-[var(--color-text-muted)]">
          {index + 1}/{items.length}
        </span>
        <div className="flex gap-1.5">
          {results.map((r, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                r ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          {item.exerciseType === 'three_choice' ? (
            <motion.div
              key={`tc-${index}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0"
            >
              <ThreeChoiceQuiz
                item={item}
                onAnswer={(correct, time) => {
                  handleAnswer(correct, time);
                  if (correct) setTimeout(handleAdvance, 1500);
                }}
              />
              {!results[index] && results.length > index && (
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <button
                    onClick={handleAdvance}
                    className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium"
                  >
                    Next
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`sd-${index}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0"
            >
              <SameDifferent
                item={item}
                onAnswer={(correct, time) => {
                  handleAnswer(correct, time);
                  setTimeout(handleAdvance, correct ? 1500 : 2500);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
