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
      <div className="flex flex-1 items-center justify-center">
        <h1 className="text-3xl font-semibold text-primary animate-pulse">
          BeakSpeak
        </h1>
      </div>
    )
  }

  return (
    <>
      <main className="app-scroll-region flex-1 overflow-y-auto">
        {activeTab === 'learn' && <LearnTab />}
        {activeTab === 'quiz' && <QuizTab />}
        {activeTab === 'progress' && <Dashboard />}
        {activeTab === 'credits' && <CreditsPage />}
      </main>
      <Navigation />
    </>
  )
}
