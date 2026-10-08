interface Props {
  message: string
  onRetry: () => void
  onBack: () => void
  backLabel?: string
}

export default function SaveError({ message, onRetry, onBack, backLabel = 'Back' }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="rounded-xl border border-error p-4 text-text">{message}</p>
      <button autoFocus onClick={onRetry} className="rounded-full bg-primary px-6 py-3 font-medium text-white">
        Retry saving
      </button>
      <button onClick={onBack} className="rounded-full border border-border px-6 py-3 text-text">
        {backLabel}
      </button>
    </div>
  )
}
