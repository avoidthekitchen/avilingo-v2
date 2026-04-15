import { useAppStore } from '../../store/appStore'

export default function Dashboard() {
  const manifest = useAppStore(s => s.manifest)
  const allProgress = useAppStore(s => s.allProgress)
  const getIntroducedSpecies = useAppStore(s => s.getIntroducedSpecies)
  const setTab = useAppStore(s => s.setTab)
  const getDueForReview = useAppStore(s => s.getDueForReview)

  if (!manifest) return null

  const introduced = getIntroducedSpecies()
  const dueForReview = getDueForReview()
  const inReviewState = Array.from(allProgress.values()).filter(
    p => p.state === 'review'
  ).length

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-text mb-4">Progress</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-primary">{introduced.length}</p>
          <p className="text-xs text-text-muted">Introduced</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-secondary">{inReviewState}</p>
          <p className="text-xs text-text-muted">Reviewing</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-bold text-error">{dueForReview.length}</p>
          <p className="text-xs text-text-muted">Due Now</p>
        </div>
      </div>

      {dueForReview.length > 0 && (
        <button
          onClick={() => setTab('quiz')}
          className="w-full mb-4 px-4 py-3 bg-primary text-white rounded-xl font-medium"
        >
          Start Review ({dueForReview.length} due)
        </button>
      )}

      <div className="space-y-2">
        {manifest.species.map(species => {
          const progress = allProgress.get(species.id)
          const stateLabel = !progress?.introduced
            ? 'New'
            : progress.state === 'new'
            ? 'Learning'
            : progress.state.charAt(0).toUpperCase() + progress.state.slice(1)
          const stateColor = !progress?.introduced
            ? 'bg-border text-text-muted'
            : progress.state === 'review'
            ? 'bg-success/20 text-success'
            : progress.state === 'relearning'
            ? 'bg-error/20 text-error'
            : 'bg-primary/20 text-primary'

          return (
            <div
              key={species.id}
              className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border"
            >
              <img
                src={species.photo.url}
                alt={species.common_name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text text-sm truncate">
                  {species.common_name}
                </p>
                <p className="text-xs text-text-muted">
                  {progress?.reps ?? 0} reps
                  {progress?.nextReview && (
                    <> · Next: {new Date(progress.nextReview).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateColor}`}>
                {stateLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
