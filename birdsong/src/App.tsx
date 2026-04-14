import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { Navigation } from './components/shared/Navigation';
import { LearnTab } from './components/learn/LearnTab';
import { QuizTab } from './components/quiz/QuizTab';
import { Dashboard } from './components/progress/Dashboard';
import { CreditsPage } from './components/credits/CreditsPage';

export default function App() {
  const initialized = useAppStore((s) => s.initialized);
  const error = useAppStore((s) => s.error);
  const activeTab = useAppStore((s) => s.activeTab);
  const activeLessonSession = useAppStore((s) => s.activeLessonSession);
  const initialize = useAppStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <h1 className="text-3xl font-bold text-[var(--color-primary)] animate-pulse-subtle">
          Birdsong
        </h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-lg text-[var(--color-error)] mb-4">{error}</p>
        <button
          onClick={initialize}
          className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        {activeTab === 'learn' && <LearnTab />}
        {activeTab === 'quiz' && <QuizTab />}
        {activeTab === 'progress' && <Dashboard />}
        {activeTab === 'credits' && <CreditsPage />}
      </div>
      {!activeLessonSession && <Navigation />}
    </div>
  );
}
