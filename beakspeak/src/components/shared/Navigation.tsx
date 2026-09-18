import { useAppStore } from '../../store/appStore'
import type { Tab } from '../../core/types'

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'learn', label: 'Learn', icon: '📖' },
  { id: 'quiz', label: 'Quiz', icon: '🎯' },
  { id: 'progress', label: 'Progress', icon: '📊' },
]

export default function Navigation() {
  const activeTab = useAppStore(s => s.activeTab)
  const setTab = useAppStore(s => s.setTab)

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="max-w-[430px] mx-auto flex items-center"
        style={{
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-label={tab.label}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-primary font-semibold'
                : 'text-text-muted'
            }`}
          >
            <span className="text-lg mb-0.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setTab('credits')}
          aria-current={activeTab === 'credits' ? 'page' : undefined}
          className={`min-w-11 px-3 py-2 text-xs transition-colors ${
            activeTab === 'credits' ? 'text-primary' : 'text-text-muted'
          }`}
        >
          About
        </button>
      </div>
    </nav>
  )
}
