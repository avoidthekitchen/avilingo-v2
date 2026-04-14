import { useState } from 'react';
import type { Lesson, LessonPhase, IntroQuizItem, ReviewQuizItem } from '../../core/types';
import { BirdCard } from './BirdCard';
import { IntroQuiz } from './IntroQuiz';
import { useAppStore } from '../../store/appStore';
import { getSpeciesByIds } from '../../core/manifest';
import { buildIntroQuiz, buildReviewQuiz } from '../../core/lesson';
import { AnimatePresence, motion } from 'framer-motion';

export function LearnSession({ lesson }: { lesson: Lesson }) {
  const manifest = useAppStore((s) => s.manifest);
  const introduceSpecies = useAppStore((s) => s.introduceSpecies);
  const setActiveLessonSession = useAppStore((s) => s.setActiveLessonSession);
  const initializedSpecies = useAppStore((s) => s.initializedSpecies);
  const lastPlayedClipId = useAppStore((s) => s.lastPlayedClipId);
  const setTab = useAppStore((s) => s.setTab);

  const lessonSpecies = manifest ? getSpeciesByIds(manifest, lesson.species) : [];

  const hasPriorSpecies = initializedSpecies().length > 0;
  const [phase, setPhase] = useState<LessonPhase>(
    hasPriorSpecies ? 'review' : 'cards'
  );
  const [cardIndex, setCardIndex] = useState(0);
  const [reviewItems] = useState<ReviewQuizItem[]>(() =>
    hasPriorSpecies ? buildReviewQuiz(initializedSpecies(), lastPlayedClipId) : []
  );

  const introItems: IntroQuizItem[] = manifest
    ? buildIntroQuiz(lesson, initializedSpecies(), manifest.species, lastPlayedClipId)
    : [];

  const handleReviewComplete = () => {
    setPhase('cards');
  };

  const handleCardNext = () => {
    if (cardIndex + 1 < lessonSpecies.length) {
      setCardIndex((i) => i + 1);
    } else {
      setPhase('quiz');
    }
  };

  const handleCardPrev = () => {
    if (cardIndex > 0) {
      setCardIndex((i) => i - 1);
    }
  };

  const handleIntroQuizComplete = async (_results: boolean[]) => {
    await introduceSpecies(lesson.species);
    setActiveLessonSession(null);
    setTab('learn');
  };

  const handleExit = () => {
    setActiveLessonSession(null);
    setTab('learn');
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-bg-subtle)]">
        <button onClick={handleExit} className="text-[var(--color-text-muted)] text-sm">
          ← Exit
        </button>
        <h2 className="font-semibold text-sm">{lesson.title}</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {phase === 'review'
            ? 'Warm-up'
            : phase === 'cards'
            ? `${cardIndex + 1}/${lessonSpecies.length}`
            : 'Quiz'}
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0"
            >
              <IntroQuiz items={reviewItems} onComplete={handleReviewComplete} />
            </motion.div>
          )}

          {phase === 'cards' && lessonSpecies[cardIndex] && (
            <motion.div
              key={`card-${cardIndex}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0 p-4"
            >
              <BirdCard
                species={lessonSpecies[cardIndex]}
                onSwipeNext={handleCardNext}
                onSwipePrev={handleCardPrev}
                isFirst={cardIndex === 0}
                isLast={cardIndex === lessonSpecies.length - 1}
              />
            </motion.div>
          )}

          {phase === 'quiz' && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0"
            >
              <IntroQuiz items={introItems} onComplete={handleIntroQuizComplete} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
