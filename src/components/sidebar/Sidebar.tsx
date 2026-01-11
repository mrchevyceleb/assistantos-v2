import { useState } from 'react'
import { Settings, Puzzle } from 'lucide-react'
import { AgentSection } from './AgentSection'
import { FilesSection } from './FilesSection'
import { MCPIndicators } from './MCPIndicators'
import { SettingsModal } from '../settings/SettingsModal'
import { IntegrationsModal } from '../settings/IntegrationsModal'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className = '' }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showIntegrations, setShowIntegrations] = useState(false)

  return (
    <>
      <aside
        className={`
          flex flex-col
          w-[220px] min-w-[220px]
          bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95
          border-r border-white/5
          ${className}
        `}
      >
        {/* App Header */}
        <div className="px-4 py-4 border-b border-white/5">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            AssistantOS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI Executive Assistant
          </p>
        </div>

        {/* Agent Section */}
        <AgentSection />

        {/* Files Section - Collapsible */}
        <FilesSection />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Section - Settings & MCPs */}
        <div className="border-t border-white/5">
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
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showIntegrations && (
        <IntegrationsModal onClose={() => setShowIntegrations(false)} />
      )}
    </>
  )
}
