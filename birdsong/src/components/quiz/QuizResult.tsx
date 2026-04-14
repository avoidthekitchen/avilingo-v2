export function QuizResult({
  results,
  againSpecies,
  nextReviewCount,
  onClose,
}: {
  results: boolean[];
  againSpecies: string[];
  nextReviewCount: number;
  onClose: () => void;
}) {
  const correct = results.filter(Boolean).length;
  const total = results.length;
  const pct = Math.round((correct / total) * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="text-6xl mb-4">
        {pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'}
      </div>
      <h2 className="text-2xl font-bold mb-2">
        {correct}/{total} correct
      </h2>
      <p className="text-[var(--color-text-muted)] mb-6">
        {pct >= 80 ? 'Great work!' : pct >= 50 ? 'Keep practicing!' : 'Review time!'}
      </p>

      {againSpecies.length > 0 && (
        <div className="w-full mb-6 p-4 bg-[var(--color-error-light)] rounded-xl">
          <p className="text-sm font-medium text-[var(--color-error)] mb-2">
            Needs more practice:
          </p>
          <ul className="text-sm text-[var(--color-error)]">
            {againSpecies.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        {nextReviewCount > 0
          ? `${nextReviewCount} bird${nextReviewCount > 1 ? 's' : ''} due for review soon`
          : 'No reviews due right now'}
      </p>

      <button
        onClick={onClose}
        className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-xl font-semibold text-lg"
      >
        Back to Home
      </button>
    </div>
  );
}
