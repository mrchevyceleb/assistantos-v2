import { useState } from 'react'
import { Settings, LayoutDashboard, ListTodo } from 'lucide-react'
import { AgentSection } from './AgentSection'
import { FilesSection } from './FilesSection'
import { MCPIndicators } from './MCPIndicators'
import { SettingsModal } from '../settings/SettingsModal'
import { IntegrationsModal } from '../settings/IntegrationsModal'
import { useTabStore } from '@/stores/tabStore'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className = '' }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showIntegrations, setShowIntegrations] = useState(false)
  const openOrFocusDashboard = useTabStore(state => state.openOrFocusDashboard)
  const openOrFocusTasks = useTabStore(state => state.openOrFocusTasks)
  const activeTab = useTabStore(state => state.getActiveTab())

  return (
    <>
      <aside
        className={`
          flex flex-col
          w-[220px] min-w-[220px] h-full
          bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95
          border-r border-white/5
          overflow-hidden
          ${className}
        `}
      >
        {/* App Header */}
        <div className="px-4 py-4 border-b border-white/5 flex-shrink-0">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            AssistantOS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI Executive Assistant
          </p>
        </div>

        {/* Dashboard Section */}
        <button
          onClick={() => openOrFocusDashboard()}
          className={`
            w-full flex items-center gap-3 px-4 py-3
            text-sm transition-colors flex-shrink-0
            border-b border-white/5
            ${activeTab?.type === 'dashboard'
              ? 'text-cyan-400 bg-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        {/* Agent Section */}
        <AgentSection />

        {/* Tasks Section */}
        <button
          onClick={() => openOrFocusTasks()}
          className={`
            w-full flex items-center gap-3 px-4 py-3
            text-sm transition-colors flex-shrink-0
            border-b border-white/5
            ${activeTab?.type === 'tasks'
              ? 'text-violet-400 bg-violet-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <ListTodo className="w-4 h-4" />
          <span>Tasks</span>
        </button>

        {/* Files Section - Collapsible, takes remaining space */}
        <FilesSection />

        {/* Bottom Section - Settings & MCPs */}
        <div className="border-t border-white/5 flex-shrink-0">
          {/* MCP Indicators */}
          <MCPIndicators onManage={() => setShowIntegrations(true)} />

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="
              w-full flex items-center gap-3 px-4 py-3
              text-slate-400 hover:text-white
              hover:bg-white/5 transition-colors
            "
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </aside>

      {/* Modals */}
      {showSettings && (
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      )}
      {showIntegrations && (
        <IntegrationsModal isOpen={showIntegrations} onClose={() => setShowIntegrations(false)} />
      )}
    </>
  )
}
