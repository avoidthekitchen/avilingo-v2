import { useAppStore } from '../../store/appStore';
import { getLessons } from '../../core/manifest';
import { isLessonAvailable, isLessonComplete, getCompletedLessonNums } from '../../core/lesson';
import { LearnSession } from './LearnSession';

export function LearnTab() {
  const manifest = useAppStore((s) => s.manifest);
  const allProgress = useAppStore((s) => s.allProgress);
  const activeLessonSession = useAppStore((s) => s.activeLessonSession);

  if (!manifest) return null;

  if (activeLessonSession) {
    return <LearnSession lesson={activeLessonSession.lesson} />;
  }

  const lessons = getLessons(manifest);
  const completedNums = getCompletedLessonNums(lessons, allProgress);
  const introducedCount = manifest.species.filter(
    (sp) => allProgress.get(sp.id)?.introduced
  ).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Birdsong</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {introducedCount}/{manifest.target_species_count} birds learned
        </p>
        <div className="mt-2 h-2 bg-[var(--color-bg-subtle)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-secondary)] rounded-full transition-all duration-500"
            style={{ width: `${(introducedCount / manifest.target_species_count) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 pb-24">
        {lessons.map((lesson) => {
          const complete = isLessonComplete(lesson, allProgress);
          const available = isLessonAvailable(lesson.lesson, completedNums, allProgress);
          const lessonSpecies = manifest.species.filter((sp) =>
            lesson.species.includes(sp.id)
          );

          return (
            <button
              key={lesson.lesson}
              disabled={!available && !complete}
              onClick={() => {
                if (available && !complete) {
                  useAppStore.getState().setActiveLessonSession({
                    lesson,
                    phase: 'cards',
                    cardIndex: 0,
                    introQuizItems: [],
                    reviewQuizItems: [],
                    quizIndex: 0,
                    quizResults: [],
                  });
                }
              }}
              className={`w-full mb-3 p-4 rounded-xl border-2 text-left transition-all ${
                complete
                  ? 'bg-[var(--color-success-light)] border-[var(--color-success)]'
                  : available
                  ? 'bg-white border-[var(--color-primary)] hover:shadow-md'
                  : 'bg-[var(--color-bg-subtle)] border-transparent opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                    Lesson {lesson.lesson}
                  </p>
                  <h3 className="font-semibold mt-0.5">{lesson.title}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {lesson.rationale}
                  </p>
                </div>
                <div className="text-xl">
                  {complete ? '✓' : available ? '→' : '🔒'}
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                {lessonSpecies.map((sp) => (
                  <div key={sp.id} className="flex flex-col items-center">
                    {sp.photo?.url && (
                      <img
                        src={sp.photo.url}
                        alt={sp.common_name}
                        className="w-10 h-10 rounded-full object-cover border border-[var(--color-bg-subtle)]"
                      />
                    )}
                    <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5 text-center leading-tight">
                      {sp.common_name.split(' ').pop()}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
