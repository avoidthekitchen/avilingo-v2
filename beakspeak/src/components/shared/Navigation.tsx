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
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-[430px] mx-auto flex items-center">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
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
          className={`px-3 py-2 text-xs transition-colors ${
            activeTab === 'credits' ? 'text-primary' : 'text-text-muted'
          }`}
        >
          About
        </button>
      </div>
    </nav>
  )
}
