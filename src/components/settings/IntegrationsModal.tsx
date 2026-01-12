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
  Search,
  Cloud,
  Image,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Wrench,
  Plus
} from 'lucide-react'
import { useAppStore, MCPIntegration, GmailAccount } from '../../stores/appStore'
import { useNotificationStore } from '../../stores/notificationStore'

// MCP Server status type
interface MCPServerStatus {
  status: string
  error?: string
  toolCount?: number
}

interface IntegrationsModalProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  browser: <Globe className="w-5 h-5" />,
  google: <Mail className="w-5 h-5" />,
  search: <Search className="w-5 h-5" />,
  cloud: <Cloud className="w-5 h-5" />,
  media: <Image className="w-5 h-5" />,
  custom: <Wrench className="w-5 h-5" />
}

const CATEGORY_LABELS: Record<string, string> = {
  browser: 'Browser',
  google: 'Google',
  search: 'Search',
  cloud: 'Cloud',
  media: 'Media',
  custom: 'Custom'
}

export function IntegrationsModal({ isOpen, onClose }: IntegrationsModalProps) {
  const {
    integrationConfigs,
    updateIntegrationEnvVars,
    setIntegrationEnabled,
    gmailAccounts,
    addGmailAccount,
    removeGmailAccount,
    setGmailAccountEnabled
  } = useAppStore()
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

        {/* Gmail Accounts Section */}
        <div className="px-6 pt-6">
          <GmailAccountsSection
            gmailAccounts={gmailAccounts}
            status={status}
            addGmailAccount={addGmailAccount}
            removeGmailAccount={removeGmailAccount}
            setGmailAccountEnabled={setGmailAccountEnabled}
          />
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
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

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

  const toggleShowSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openApiKeyUrl = () => {
    if (integration.apiKeyUrl) {
      window.electronAPI.shell.openExternal(integration.apiKeyUrl)
    }
  }

  const isEnabled = config?.enabled || false
  const hasOAuth = !!integration.oauth
  // Check if all required env vars are configured (considering defaults)
  // For OAuth integrations with embedded credentials, no config is needed
  const isConfigured = hasOAuth
    ? true // OAuth with embedded credentials is always ready
    : integration.requiredEnvVars.length === 0 ||
      integration.requiredEnvVars.every(v => envVars[v.key] || v.defaultValue)

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
          {/* Get API Key link */}
          {integration.apiKeyUrl && (
            <button
              onClick={openApiKeyUrl}
              className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Get API Key
            </button>
          )}

          {hasOAuth ? (
            <div>
              <p className="text-sm text-slate-400 mb-3">
                Click "Authorize" to connect your Google account. No additional configuration needed.
              </p>
              <button
                onClick={async () => {
                  // Trigger OAuth flow via IPC
                  console.log('[IntegrationModal] Starting OAuth flow for', integration.id)
                  const result = await window.electronAPI.mcp.startOAuth(integration.id)
                  if (result.success) {
                    console.log('[IntegrationModal] OAuth successful!')
                    // Optionally enable the integration automatically
                    onToggle(true)
                  } else {
                    console.error('[IntegrationModal] OAuth failed:', result.error)
                    alert(`OAuth failed: ${result.error}`)
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Authorize with Google
              </button>
              <p className="text-xs text-slate-500 mt-2">
                Opens a browser window to sign in with your Google account.
              </p>
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
                  <div className="relative">
                    <input
                      type={envVar.type === 'apiKey' && !showSecrets[envVar.key] ? 'password' : 'text'}
                      value={envVars[envVar.key] || ''}
                      onChange={(e) => handleEnvVarChange(envVar.key, e.target.value)}
                      placeholder={envVar.defaultValue || (envVar.type === 'apiKey' ? '••••••••••••••••' : '')}
                      className="w-full px-3 py-2 pr-10 bg-slate-800 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                    />
                    {envVar.type === 'apiKey' && (
                      <button
                        type="button"
                        onClick={() => toggleShowSecret(envVar.key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                        title={showSecrets[envVar.key] ? 'Hide' : 'Show'}
                      >
                        {showSecrets[envVar.key] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {envVar.defaultValue && !envVars[envVar.key] && (
                    <p className="text-xs text-slate-500 mt-1">
                      Default: {envVar.defaultValue}
                    </p>
                  )}
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
              This integration doesn't require any configuration. Just enable it!
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// Gmail Accounts Section
// ============================================

interface GmailAccountsSectionProps {
  gmailAccounts: GmailAccount[]
  status: Record<string, MCPServerStatus>
  addGmailAccount: (account: GmailAccount) => void
  removeGmailAccount: (id: string) => void
  setGmailAccountEnabled: (id: string, enabled: boolean) => void
}

function GmailAccountsSection({
  gmailAccounts,
  status,
  addGmailAccount,
  removeGmailAccount,
  setGmailAccountEnabled
}: GmailAccountsSectionProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const addNotification = useNotificationStore((state) => state.addNotification)

  const handleRemoveAccount = async (account: GmailAccount) => {
    const confirmed = confirm(
      `Remove Gmail account "${account.label}" (${account.email})?\n\nThis will disconnect the account and stop all related tools.`
    )
    if (!confirmed) return

    setIsRemoving(account.id)
    try {
      const result = await window.electronAPI.mcp.removeGmailAccount(account.id, account.integrationId)
      if (result.success) {
        removeGmailAccount(account.id)
        addNotification('Gmail Account Removed', 'Account removed successfully', 'success')
      } else {
        addNotification('Remove Failed', `Failed to remove account: ${result.error}`, 'error')
      }
    } catch (error) {
      addNotification('Remove Failed', 'Failed to remove account', 'error')
    } finally {
      setIsRemoving(null)
    }
  }

  const handleToggle = async (account: GmailAccount, enabled: boolean) => {
    setGmailAccountEnabled(account.id, enabled)
    if (enabled) {
      await window.electronAPI.mcp.start(account.integrationId)
    } else {
      await window.electronAPI.mcp.stop(account.integrationId)
    }
  }

  return (
    <div className="mb-6">
      <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-400" />
              Gmail Accounts
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Connect multiple Gmail accounts to use simultaneously
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>

        {gmailAccounts.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
            <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 mb-4">No Gmail accounts configured</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm transition-colors"
            >
              Add your first Gmail account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {gmailAccounts.map((account) => (
              <GmailAccountCard
                key={account.id}
                account={account}
                status={status[account.integrationId]}
                isRemoving={isRemoving === account.id}
                onToggle={(enabled) => handleToggle(account, enabled)}
                onRemove={() => handleRemoveAccount(account)}
              />
            ))}
          </div>
        )}

        {showAddModal && (
          <AddGmailAccountModal
            existingLabels={gmailAccounts.map(a => a.label)}
            onClose={() => setShowAddModal(false)}
            onAdd={async (label) => {
              const result = await window.electronAPI.mcp.addGmailAccount(label)
              if (result.success && result.account) {
                addGmailAccount(result.account)
                setShowAddModal(false)

                // Auto-start the new account
                await window.electronAPI.mcp.start(result.account.integrationId)

                addNotification('Gmail Account Added', `Gmail account "${label}" added successfully`, 'success')
              } else {
                addNotification('Add Failed', result.error || 'Failed to add account', 'error')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

// ============================================
// Gmail Account Card
// ============================================

interface GmailAccountCardProps {
  account: GmailAccount
  status?: MCPServerStatus
  isRemoving: boolean
  onToggle: (enabled: boolean) => void
  onRemove: () => void
}

function GmailAccountCard({ account, status, isRemoving, onToggle, onRemove }: GmailAccountCardProps) {
  const isReady = status?.status === 'ready'
  const isError = status?.status === 'error'
  const toolCount = status?.toolCount || 0

  return (
    <div className={`
      flex items-center justify-between p-4 rounded-lg border
      ${isError ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-900/50 border-white/5'}
      ${isRemoving ? 'opacity-50' : ''}
    `}>
      <div className="flex items-center gap-4 flex-1">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center
          ${isReady ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'}
        `}>
          <Mail className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-white">{account.label}</span>
            <code className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
              {`@gmail-${account.label.toLowerCase().replace(/\s+/g, '-')}`}
            </code>
            {isReady && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                Ready
              </span>
            )}
            {isError && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                Error
              </span>
            )}
          </div>
          <div className="text-sm text-slate-400">
            {account.email}
            {isReady && ` • ${toolCount} tools available`}
            {isError && ` • ${status?.error || 'Connection failed'}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Toggle Switch */}
        <button
          onClick={() => onToggle(!account.enabled)}
          disabled={isRemoving}
          className={`
            relative w-12 h-6 rounded-full transition-colors
            ${account.enabled ? 'bg-cyan-500' : 'bg-slate-600'}
          `}
          title={account.enabled ? 'Disable account' : 'Enable account'}
        >
          <div className={`
            absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
            ${account.enabled ? 'translate-x-7' : 'translate-x-1'}
          `} />
        </button>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors disabled:opacity-50"
          title="Remove account"
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================
// Add Gmail Account Modal
// ============================================

interface AddGmailAccountModalProps {
  existingLabels: string[]
  onClose: () => void
  onAdd: (label: string) => Promise<void>
}

function AddGmailAccountModal({ existingLabels, onClose, onAdd }: AddGmailAccountModalProps) {
  const [label, setLabel] = useState('')
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [error, setError] = useState('')

  const suggestedLabels = ['Work', 'Personal', 'Side Project', 'Freelance', 'School']
  const availableSuggestions = suggestedLabels.filter(s => !existingLabels.includes(s))

  const handleAdd = async () => {
    const trimmedLabel = label.trim()

    if (!trimmedLabel) {
      setError('Please enter a label for this account')
      return
    }

    if (existingLabels.includes(trimmedLabel)) {
      setError(`Label "${trimmedLabel}" is already used. Please choose a different label.`)
      return
    }

    setError('')
    setIsAuthorizing(true)

    try {
      await onAdd(trimmedLabel)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account')
      setIsAuthorizing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-xl border border-white/10 p-6 w-[450px] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Add Gmail Account</h3>
          <button
            onClick={onClose}
            disabled={isAuthorizing}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Account Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder='e.g., "Work", "Personal", "Side Project"'
            className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            disabled={isAuthorizing}
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
        </div>

        {availableSuggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-2">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setLabel(suggestion)}
                  disabled={isAuthorizing}
                  className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 mb-4">
          <p className="text-xs text-cyan-300">
            After clicking "Authorize", you'll sign in with your Google account.
            Your email address will be automatically detected.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            disabled={isAuthorizing}
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={isAuthorizing || !label.trim()}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAuthorizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authorizing...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                Authorize with Google
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
