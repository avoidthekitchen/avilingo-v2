import { useAppStore } from '../../store/appStore';

const tabs = [
  { id: 'learn' as const, label: 'Learn', icon: '📖' },
  { id: 'quiz' as const, label: 'Quiz', icon: '🎯' },
  { id: 'progress' as const, label: 'Progress', icon: '📊' },
] as const;

export function Navigation() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--color-bg-subtle)] flex justify-around items-center h-16 z-50"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs mt-0.5 font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
