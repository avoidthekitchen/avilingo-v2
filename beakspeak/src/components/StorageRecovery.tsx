import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { StorageFailureKind } from '../adapters/storageErrors'

const messages: Record<StorageFailureKind, string> = {
  unavailable: "Saved progress couldn't be loaded. Please try again. If this keeps happening, fully close and reopen BeakSpeak.",
  corrupt: 'Some saved progress could not be read. You can retry, or erase all saved progress and start over.',
  'newer-schema': 'Your saved progress was created by a newer version of BeakSpeak. Update the app to continue.',
  timeout: 'Loading saved progress took too long. Retry after a moment. If it still does not load, fully close and reopen BeakSpeak.',
}

export default function StorageRecovery({ failure }: { failure: StorageFailureKind }) {
  const initializing = useAppStore(s => s.initializing)
  const initialize = useAppStore(s => s.initialize)
  const eraseCorruptProgress = useAppStore(s => s.eraseCorruptProgress)
  const activeTab = useAppStore(s => s.activeTab)
  const setTab = useAppStore(s => s.setTab)
  const [confirming, setConfirming] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [eraseError, setEraseError] = useState(false)
  const busy = initializing || erasing

  return (
    <div className="m-4 rounded-xl border border-error p-4">
      <p role="alert" className="mb-3 text-text">
        {messages[failure]} Your saved data has not been reset.
        {' '}You can still listen to bird sounds and view credits.
      </p>
      <div className="flex flex-wrap gap-2">
        {failure !== 'newer-schema' && (
          <button disabled={busy} onClick={() => { void initialize() }} className="rounded-full bg-primary px-4 py-2 text-white">
            {initializing && !erasing ? 'Loading progress…' : 'Retry loading progress'}
          </button>
        )}
        {(activeTab === 'learn' || activeTab === 'quiz') && (
          <button onClick={() => setTab('progress')} className="rounded-full border border-border px-4 py-2 text-text">
            Listen to bird sounds
          </button>
        )}
        {failure === 'corrupt' && !confirming && (
          <button disabled={busy} onClick={() => setConfirming(true)} className="rounded-full border border-error px-4 py-2 text-error">
            Erase saved progress and start over
          </button>
        )}
      </div>
      {failure === 'corrupt' && confirming && (
        <div role="group" aria-labelledby="erase-progress-title" aria-busy={erasing} className="mt-4 space-y-3">
          <h2 id="erase-progress-title" className="font-semibold text-text">Erase all saved progress?</h2>
          <p className="text-text">This permanently erases all saved progress and confusion history. It cannot be undone.</p>
          {eraseError && <p role="alert" className="text-error">Saved progress could not be erased. Your saved data has not been reset. Please try again.</p>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => { setConfirming(false); setEraseError(false) }} className="rounded-full border border-border px-4 py-2 text-text">
              Cancel
            </button>
            <button disabled={busy} className="rounded-full bg-error px-4 py-2 text-white" onClick={async () => {
              setErasing(true)
              setEraseError(false)
              try {
                await eraseCorruptProgress()
              } catch {
                setEraseError(true)
              } finally {
                setErasing(false)
              }
            }}>
              {erasing ? 'Erasing progress…' : 'Yes, erase saved progress'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
