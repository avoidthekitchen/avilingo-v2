import { useAppStore } from '../../store/appStore'
import AppIcon from './AppIcon'
import type { AppIconName } from './AppIcon'
import type { Tab } from '../../core/types'

const tabs: Array<{ id: Tab; label: string; icon: AppIconName }> = [
  { id: 'learn', label: 'Learn', icon: 'learn' },
  { id: 'quiz', label: 'Quiz', icon: 'quiz' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
]

export default function Navigation() {
  const activeTab = useAppStore(s => s.activeTab)
  const setTab = useAppStore(s => s.setTab)
  const sessionActive = useAppStore(s => s.sessionActive)

  return (
    <nav
      aria-label="Main"
      className="app-navigation fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40"
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
            disabled={sessionActive}
            title={sessionActive ? "Use Back or Quit to leave this session" : undefined}
            onClick={() => setTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-label={tab.label}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-primary font-semibold'
                : 'text-text-muted'
            }`}
          >
            <AppIcon name={tab.icon} className="tab-icon mb-0.5" />
            {tab.label}
          </button>
        ))}
        <button
          disabled={sessionActive}
          title={sessionActive ? 'Use Back or Quit to leave this session' : undefined}
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
