import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { countDue, hasRelearning } from '../../core/quiz';
import { QuizSession } from './QuizSession';
import type { UserProgress } from '../../core/types';

export function QuizTab() {
  const allProgress = useAppStore((s) => s.allProgress);
  const setTab = useAppStore((s) => s.setTab);
  const initializedSpecies = useAppStore((s) => s.initializedSpecies);

  const [quizzing, setQuizzing] = useState(false);

  if (quizzing) {
    return <QuizSession />;
  }

  const introduced = initializedSpecies();
  const dueCount = countDue(allProgress);
  const relearning = hasRelearning(allProgress);

  if (introduced.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-5xl mb-4">🐣</div>
        <h2 className="text-xl font-bold mb-2">No birds learned yet</h2>
        <p className="text-[var(--color-text-muted)] mb-6">
          Start learning birds to unlock quizzes!
        </p>
        <button
          onClick={() => setTab('learn')}
          className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-xl font-semibold"
        >
          Learn Birds
        </button>
      </div>
    );
  }

  if (dueCount === 0) {
    const nextReview = findNextReview(allProgress);

    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-5xl mb-4">✨</div>
        <h2 className="text-xl font-bold mb-2">All caught up!</h2>
        {nextReview && (
          <p className="text-[var(--color-text-muted)] mb-4">
            Next review: {formatRelativeDate(nextReview)}
          </p>
        )}
        {relearning ? (
          <p className="text-sm text-[var(--color-error)]">
            Some birds need more practice. Keep reviewing!
          </p>
        ) : (
          <button
            onClick={() => setTab('learn')}
            className="px-6 py-3 bg-[var(--color-secondary)] text-white rounded-xl font-semibold"
          >
            Learn More Birds
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="text-5xl mb-4">🎯</div>
      <h2 className="text-xl font-bold mb-2">
        {dueCount} bird{dueCount > 1 ? 's' : ''} to review
      </h2>
      <p className="text-[var(--color-text-muted)] mb-6">
        Test your knowledge with spaced repetition
      </p>
      <button
        onClick={() => setQuizzing(true)}
        className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-xl font-semibold text-lg"
      >
        Start Review
      </button>
    </div>
  );
}

function findNextReview(allProgress: Map<string, UserProgress>): Date | null {
  let earliest: Date | null = null;
  for (const p of allProgress.values()) {
    if (!p.introduced || !p.nextReview) continue;
    if (p.nextReview <= Date.now()) continue;
    const d = new Date(p.nextReview);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

function formatRelativeDate(date: Date): string {
  const diff = date.getTime() - Date.now();
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 1) return 'soon';
  if (hours < 24) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days > 1 ? 's' : ''}`;
}
