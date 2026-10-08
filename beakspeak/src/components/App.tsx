import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { useAppStore } from '../store/appStore'
import Navigation from './shared/Navigation'
import LearnTab from './learn/LearnTab'
import QuizTab from './quiz/QuizTab'
import Dashboard from './progress/Dashboard'
import CreditsPage from './credits/CreditsPage'
import { stopAudioDuringInterruptions } from '../adapters/audioLifecycle'

export default function App() {
  const initialized = useAppStore(s => s.initialized)
  const error = useAppStore(s => s.error)
  const progressLoadError = useAppStore(s => s.progressLoadError)
  const initializing = useAppStore(s => s.initializing)
  const setTab = useAppStore(s => s.setTab)
  const activeTab = useAppStore(s => s.activeTab)
  const initialize = useAppStore(s => s.initialize)
  const audioPlayer = useAppStore(s => s.audioPlayer)

  useEffect(
    () => stopAudioDuringInterruptions(
      audioPlayer,
      Capacitor.isNativePlatform() ? CapacitorApp : undefined,
    ),
    [audioPlayer],
  )

  useEffect(() => {
    initialize()
  }, [initialize])

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-error text-center">Couldn't load bird data.</p>
        <button
          onClick={initialize}
          className="px-6 py-2 bg-primary text-white rounded-full font-medium"
        >
          Tap to retry
        </button>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <h1 className="text-[30px] font-semibold text-primary animate-pulse motion-reduce:animate-none">
          BeakSpeak
        </h1>
      </div>
    )
  }

  return (
    <>
      <main className="app-scroll-region flex-1 overflow-y-auto">
        {progressLoadError && (
          <div className="m-4 rounded-xl border border-error p-4">
            <p role="alert" className="mb-3 text-text">
              Saved progress couldn&apos;t be loaded. Your saved data has not been reset.
              You can still listen to bird sounds and view credits.
            </p>
            <button disabled={initializing} onClick={() => { void initialize() }} className="rounded-full bg-primary px-4 py-2 text-white">
              {initializing ? 'Loading progress…' : 'Retry loading progress'}
            </button>
            {(activeTab === 'learn' || activeTab === 'quiz') && (
              <button onClick={() => setTab('progress')} className="ml-2 rounded-full border border-border px-4 py-2 text-text">
                Listen to bird sounds
              </button>
            )}
          </div>
        )}
        {activeTab === 'learn' && !progressLoadError && <LearnTab />}
        {activeTab === 'quiz' && !progressLoadError && <QuizTab />}
        {activeTab === 'progress' && <Dashboard progressAvailable={!progressLoadError} />}
        {activeTab === 'credits' && <CreditsPage />}
      </main>
      <Navigation />
    </>
  )
}
