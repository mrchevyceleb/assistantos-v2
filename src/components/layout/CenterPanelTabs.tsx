import { FileText, LayoutDashboard, CheckSquare } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { CenterPanelView } from '../../types/task'

interface TabConfig {
  id: CenterPanelView
  label: string
  icon: React.ReactNode
  shortcut: string
}

const tabs: TabConfig[] = [
  { id: 'editor', label: 'Editor', icon: <FileText className="w-4 h-4" />, shortcut: '1' },
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, shortcut: '2' },
  { id: 'tasks', label: 'Tasks', icon: <CheckSquare className="w-4 h-4" />, shortcut: '3' },
]

export function CenterPanelTabs() {
  const { centerPanelView, setCenterPanelView } = useAppStore()

  return (
    <div
      className="h-10 flex items-center gap-1 px-2 relative"
      style={{
        background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.8) 0%, rgba(16, 20, 32, 0.9) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}
    >
      {/* Top edge highlight */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.02))'
        }}
      />

      {tabs.map((tab) => {
        const isActive = centerPanelView === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setCenterPanelView(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all relative ${
              isActive
                ? 'text-cyan-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'
            }`}
            title={`${tab.label} (Ctrl+${tab.shortcut})`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {isActive && (
              <div
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #00d4ff, #00a8cc)'
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
