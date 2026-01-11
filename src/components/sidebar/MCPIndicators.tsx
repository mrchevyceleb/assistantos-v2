import { useState, useEffect } from 'react'
import { Puzzle, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface MCPStatus {
  id: string
  name: string
  enabled: boolean
  ready: boolean
}

interface MCPIndicatorsProps {
  onManage: () => void
}

export function MCPIndicators({ onManage }: MCPIndicatorsProps) {
  const [mcpStatuses, setMcpStatuses] = useState<MCPStatus[]>([])
  const integrationConfigs = useAppStore(state => state.integrationConfigs)

  // Load MCP statuses
  useEffect(() => {
    loadStatuses()
    // Refresh every 5 seconds
    const interval = setInterval(loadStatuses, 5000)
    return () => clearInterval(interval)
  }, [integrationConfigs])

  const loadStatuses = async () => {
    try {
      const integrations = await window.electronAPI?.mcp?.getIntegrations?.()
      if (!integrations) return

      const statuses: MCPStatus[] = []

      for (const integration of integrations) {
        const config = integrationConfigs[integration.id]
        if (config?.enabled) {
          const ready = await window.electronAPI?.mcp?.isReady?.(integration.id) ?? false
          statuses.push({
            id: integration.id,
            name: integration.name,
            enabled: true,
            ready,
          })
        }
      }

      setMcpStatuses(statuses)
    } catch (error) {
      console.error('Failed to load MCP statuses:', error)
    }
  }

  const enabledCount = mcpStatuses.length
  const readyCount = mcpStatuses.filter(s => s.ready).length

  return (
    <button
      onClick={onManage}
      className="
        w-full flex items-center justify-between px-4 py-3
        text-slate-400 hover:text-white
        hover:bg-white/5 transition-colors
        border-b border-white/5
      "
    >
      <div className="flex items-center gap-3">
        <Puzzle className="w-4 h-4" />
        <span className="text-sm">Integrations</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Status Dots */}
        {enabledCount > 0 && (
          <div className="flex items-center gap-1">
            {mcpStatuses.slice(0, 5).map((status) => (
              <div
                key={status.id}
                className={`
                  w-2 h-2 rounded-full
                  ${status.ready
                    ? 'bg-emerald-400'
                    : 'bg-amber-400 animate-pulse'
                  }
                `}
                title={`${status.name}: ${status.ready ? 'Ready' : 'Connecting...'}`}
              />
            ))}
            {enabledCount > 5 && (
              <span className="text-xs text-slate-500">+{enabledCount - 5}</span>
            )}
          </div>
        )}

        {enabledCount === 0 && (
          <span className="text-xs text-slate-500">None active</span>
        )}

        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>
    </button>
  )
}
