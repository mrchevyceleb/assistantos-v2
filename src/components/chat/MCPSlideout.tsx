/**
 * MCP Slideout Panel
 * Quick access to toggle MCP integrations on/off
 * Slides in from the right edge of the chat panel
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Globe,
  Mail,
  Search,
  Cloud,
  Image,
  ChevronRight,
  Settings2
} from 'lucide-react'
import { useAppStore, MCPIntegration } from '../../stores/appStore'

// MCP Server status type
interface MCPServerStatus {
  status: string
  error?: string
  toolCount?: number
}

interface MCPSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onOpenFullConfig: () => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  browser: <Globe className="w-4 h-4" />,
  google: <Mail className="w-4 h-4" />,
  search: <Search className="w-4 h-4" />,
  cloud: <Cloud className="w-4 h-4" />,
  media: <Image className="w-4 h-4" />
}

export function MCPSlideout({ isOpen, onClose, onOpenFullConfig }: MCPSlideoutProps) {
  const { integrationConfigs, setIntegrationEnabled } = useAppStore()
  const [integrations, setIntegrations] = useState<MCPIntegration[]>([])
  const [status, setStatus] = useState<Record<string, MCPServerStatus>>({})

  const loadIntegrations = useCallback(async () => {
    const data = await window.electronAPI.mcp.getIntegrations()
    setIntegrations(data)
  }, [])

  const loadStatus = useCallback(async () => {
    const data = await window.electronAPI.mcp.getStatus()
    setStatus(data)
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadIntegrations()
      loadStatus()
      // Poll status every 2 seconds while open
      const interval = setInterval(loadStatus, 2000)
      return () => clearInterval(interval)
    }
  }, [isOpen, loadIntegrations, loadStatus])

  const handleToggle = async (integrationId: string, enabled: boolean) => {
    setIntegrationEnabled(integrationId, enabled)

    if (!enabled) {
      // Stop the server if disabling
      await window.electronAPI.mcp.stop(integrationId).catch(console.error)
    }

    // Refresh status
    setTimeout(loadStatus, 500)
  }

  const getStatusIndicator = (integrationId: string) => {
    const s = status[integrationId]
    if (!s) return { color: 'bg-slate-500', icon: null }

    switch (s.status) {
      case 'ready':
        return { color: 'bg-green-400', icon: <Check className="w-3 h-3" /> }
      case 'starting':
        return { color: 'bg-yellow-400', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
      case 'error':
        return { color: 'bg-red-400', icon: <AlertCircle className="w-3 h-3" /> }
      default:
        return { color: 'bg-slate-500', icon: null }
    }
  }

  const isConfigured = (integration: MCPIntegration) => {
    if (integration.oauth) return false // OAuth needs separate handling
    const config = integrationConfigs[integration.id]
    if (integration.requiredEnvVars.length === 0) return true
    return integration.requiredEnvVars.every(v => config?.envVars?.[v.key])
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity z-10 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slideout Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-72 z-20 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(20, 25, 40, 0.98) 0%, rgba(12, 16, 28, 0.99) 100%)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">Integrations</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenFullConfig}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
              title="Full configuration"
            >
              <Settings2 className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Integration List */}
        <div className="overflow-y-auto h-[calc(100%-52px)] py-2">
          {integrations.map(integration => {
            const config = integrationConfigs[integration.id]
            const isEnabled = config?.enabled || false
            const configured = isConfigured(integration)
            const statusInfo = getStatusIndicator(integration.id)
            const s = status[integration.id]

            return (
              <div
                key={integration.id}
                className="px-3 py-2 mx-2 my-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Status Dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isEnabled ? statusInfo.color : 'bg-slate-600'
                  }`} />

                  {/* Icon */}
                  <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                    {CATEGORY_ICONS[integration.category]}
                  </div>

                  {/* Name & Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white truncate">{integration.name}</span>
                      {s?.toolCount && s.status === 'ready' && (
                        <span className="text-[10px] text-slate-500">{s.toolCount}</span>
                      )}
                    </div>
                    {!configured && (
                      <button
                        onClick={onOpenFullConfig}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                      >
                        Configure
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    {s?.error && (
                      <p className="text-[10px] text-red-400 truncate" title={s.error}>
                        {s.error.slice(0, 30)}...
                      </p>
                    )}
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => handleToggle(integration.id, !isEnabled)}
                    disabled={!configured && !isEnabled}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      isEnabled ? 'bg-cyan-500' : 'bg-slate-600'
                    } ${(!configured && !isEnabled) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={!configured && !isEnabled ? 'Configure first' : undefined}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )
          })}

          {integrations.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Loading integrations...
            </div>
          )}
        </div>
      </div>
    </>
  )
}
