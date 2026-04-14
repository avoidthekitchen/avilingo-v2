import { useAppStore } from '../../store/appStore';
import { countDue } from '../../core/quiz';
import { getNextReviewDate } from '../../core/fsrs';

export function Dashboard() {
  const manifest = useAppStore((s) => s.manifest);
  const allProgress = useAppStore((s) => s.allProgress);
  const setTab = useAppStore((s) => s.setTab);

  if (!manifest) return null;

  const introduced = manifest.species.filter(
    (sp) => allProgress.get(sp.id)?.introduced
  ).length;
  const inReview = manifest.species.filter(
    (sp) => allProgress.get(sp.id)?.state === 'review'
  ).length;
  const dueCount = countDue(allProgress);

  const stateBadge = (state: string) => {
    switch (state) {
      case 'new':
        return 'bg-gray-100 text-gray-600';
      case 'learning':
        return 'bg-yellow-100 text-yellow-700';
      case 'review':
        return 'bg-green-100 text-green-700';
      case 'relearning':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--color-bg-subtle)]">
        <h1 className="text-xl font-bold mb-3">Progress</h1>
        <div className="flex gap-3 text-sm">
          <div className="flex-1 bg-[var(--color-bg)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-secondary)]">{introduced}</p>
            <p className="text-[var(--color-text-muted)]">learned</p>
          </div>
          <div className="flex-1 bg-[var(--color-bg)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-primary)]">{inReview}</p>
            <p className="text-[var(--color-text-muted)]">in review</p>
          </div>
          <div className="flex-1 bg-[var(--color-bg)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{dueCount}</p>
            <p className="text-[var(--color-text-muted)]">due now</p>
          </div>
        </div>
        {dueCount > 0 && (
          <button
            onClick={() => setTab('quiz')}
            className="w-full mt-3 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium text-sm"
          >
            Start Review ({dueCount})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 pb-24">
        {manifest.species.map((sp) => {
          const progress = allProgress.get(sp.id);
          const state = progress?.state ?? 'new';
          const nextDate = progress ? getNextReviewDate(progress) : null;

          return (
            <div
              key={sp.id}
              className="flex items-center gap-3 py-3 border-b border-[var(--color-bg-subtle)]"
            >
              {sp.photo?.url && (
                <img
                  src={sp.photo.url}
                  alt={sp.common_name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{sp.common_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {progress?.introduced
                    ? nextDate
                      ? nextDate <= new Date()
                        ? 'Due now'
                        : `Review ${formatRelativeDate(nextDate)}`
                      : 'Not started'
                    : 'Not started'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {progress && progress.reps > 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {progress.reps} reps
                  </span>
                )}
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${stateBadge(state)}`}>
                  {state}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeDate(date: Date): string {
  const diff = date.getTime() - Date.now();
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 1) return 'soon';
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
