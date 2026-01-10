/**
 * Integrations Modal
 * Settings modal for configuring MCP integrations
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Globe,
  Mail,
  Calendar,
  Search,
  Cloud,
  Image,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface IntegrationsModalProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  browser: <Globe className="w-5 h-5" />,
  google: <Mail className="w-5 h-5" />,
  search: <Search className="w-5 h-5" />,
  cloud: <Cloud className="w-5 h-5" />,
  media: <Image className="w-5 h-5" />
}

const CATEGORY_LABELS: Record<string, string> = {
  browser: 'Browser',
  google: 'Google',
  search: 'Search',
  cloud: 'Cloud',
  media: 'Media'
}

export function IntegrationsModal({ isOpen, onClose }: IntegrationsModalProps) {
  const { integrationConfigs, updateIntegrationEnvVars, setIntegrationEnabled } = useAppStore()
  const [integrations, setIntegrations] = useState<MCPIntegration[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('browser')
  const [status, setStatus] = useState<Record<string, MCPServerStatus>>({})
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  const loadIntegrations = useCallback(async () => {
    const data = await window.electronAPI.mcp.getIntegrations()
    setIntegrations(data)
    // Set first category as active
    if (data.length > 0) {
      const categories = [...new Set(data.map(i => i.category))]
      setActiveCategory(categories[0])
    }
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

  const handleSaveConfig = async (integrationId: string, envVars: Record<string, string>) => {
    updateIntegrationEnvVars(integrationId, envVars)
    await window.electronAPI.mcp.configure(integrationId, envVars)
  }

  const handleToggleEnabled = (integrationId: string, enabled: boolean) => {
    // Just update the enabled state - servers start on-demand when @mentioned
    setIntegrationEnabled(integrationId, enabled)

    // If disabling, stop any running server
    if (!enabled) {
      window.electronAPI.mcp.stop(integrationId).catch(console.error)
    }
  }

  const toggleCardExpanded = (integrationId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [integrationId]: !prev[integrationId]
    }))
  }

  const categories = [...new Set(integrations.map(i => i.category))]
  const filteredIntegrations = integrations.filter(i => i.category === activeCategory)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl w-[800px] max-h-[85vh] overflow-hidden border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Integrations</h2>
            <p className="text-sm text-slate-400 mt-1">
              Configure MCP integrations. Use @mentions in chat to activate them.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 px-6 py-3 border-b border-white/5 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
              }`}
            >
              {CATEGORY_ICONS[cat]}
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Integration List */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-160px)] space-y-4">
          {filteredIntegrations.map(integration => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              config={integrationConfigs[integration.id]}
              status={status[integration.id]}
              isExpanded={expandedCards[integration.id]}
              onToggleExpanded={() => toggleCardExpanded(integration.id)}
              onSaveConfig={(envVars) => handleSaveConfig(integration.id, envVars)}
              onToggle={(enabled) => handleToggleEnabled(integration.id, enabled)}
            />
          ))}

          {filteredIntegrations.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No integrations in this category
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface IntegrationCardProps {
  integration: MCPIntegration
  config?: { enabled: boolean; envVars: Record<string, string> }
  status?: MCPServerStatus
  isExpanded?: boolean
  onToggleExpanded: () => void
  onSaveConfig: (envVars: Record<string, string>) => void
  onToggle: (enabled: boolean) => void
}

function IntegrationCard({
  integration,
  config,
  status,
  isExpanded,
  onToggleExpanded,
  onSaveConfig,
  onToggle
}: IntegrationCardProps) {
  const [envVars, setEnvVars] = useState<Record<string, string>>(config?.envVars || {})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (config?.envVars) {
      setEnvVars(config.envVars)
    }
  }, [config?.envVars])

  const handleEnvVarChange = (key: string, value: string) => {
    setEnvVars(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onSaveConfig(envVars)
    setHasChanges(false)
  }

  const isEnabled = config?.enabled || false
  const hasOAuth = !!integration.oauth
  const isConfigured = hasOAuth
    ? false // OAuth needs separate handling
    : integration.requiredEnvVars.length === 0 ||
      integration.requiredEnvVars.every(v => envVars[v.key])

  const statusColor = status?.status === 'ready'
    ? 'text-green-400'
    : status?.status === 'error'
    ? 'text-red-400'
    : status?.status === 'starting'
    ? 'text-yellow-400'
    : 'text-slate-500'

  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/5 overflow-hidden">
      {/* Header Row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
            {CATEGORY_ICONS[integration.category]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-white truncate">{integration.name}</h3>
              <code className="text-xs text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                {integration.mention}
              </code>
            </div>
            <p className="text-sm text-slate-400 truncate">{integration.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Status indicator */}
          {status?.status && (
            <div className={`flex items-center gap-1 text-xs ${statusColor}`}>
              {status.status === 'ready' && <Check className="w-3 h-3" />}
              {status.status === 'error' && <AlertCircle className="w-3 h-3" />}
              {status.status === 'starting' && <Loader2 className="w-3 h-3 animate-spin" />}
              <span className="capitalize">{status.status}</span>
              {status.toolCount !== undefined && status.status === 'ready' && (
                <span className="text-slate-500">({status.toolCount} tools)</span>
              )}
            </div>
          )}

          {/* Configure button */}
          {(integration.requiredEnvVars.length > 0 || hasOAuth) && (
            <button
              onClick={onToggleExpanded}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Configure
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Enable toggle */}
          <button
            onClick={() => onToggle(!isEnabled)}
            disabled={!isConfigured && !isEnabled}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              isEnabled ? 'bg-cyan-500' : 'bg-slate-600'
            } ${(!isConfigured && !isEnabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            title={!isConfigured && !isEnabled ? 'Configure API key first' : undefined}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                isEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Error message */}
      {status?.error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
            {status.error}
          </p>
        </div>
      )}

      {/* Config Panel */}
      {isExpanded && (
        <div className="border-t border-white/5 p-4 space-y-4 bg-slate-900/50">
          {hasOAuth ? (
            <div>
              <p className="text-sm text-slate-400 mb-3">
                This integration uses OAuth authentication.
              </p>
              <button
                disabled={true}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-400 rounded-lg text-sm cursor-not-allowed"
              >
                <ExternalLink className="w-4 h-4" />
                Connect Account (Coming Soon)
              </button>
            </div>
          ) : integration.requiredEnvVars.length > 0 ? (
            <>
              {integration.requiredEnvVars.map(envVar => (
                <div key={envVar.key}>
                  <label className="block text-sm text-slate-400 mb-1.5">
                    {envVar.label}
                    {envVar.description && (
                      <span className="text-slate-500 ml-1">- {envVar.description}</span>
                    )}
                  </label>
                  <input
                    type={envVar.type === 'apiKey' ? 'password' : 'text'}
                    value={envVars[envVar.key] || ''}
                    onChange={(e) => handleEnvVarChange(envVar.key, e.target.value)}
                    placeholder={envVar.type === 'apiKey' ? '••••••••••••••••' : ''}
                    className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              ))}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    hasChanges
                      ? 'bg-cyan-500 hover:bg-cyan-600 text-white'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Save Configuration
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              This integration doesn't require any configuration.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
