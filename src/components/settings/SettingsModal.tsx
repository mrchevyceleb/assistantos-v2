/**
 * Settings Modal
 * Full modal overlay with card-based sections for app configuration
 */

import { useState, useEffect } from 'react'
import {
  X,
  Settings,
  Bot,
  FileText,
  HardDrive,
  ExternalLink,
  RotateCcw,
  Eye,
  EyeOff,
  CheckSquare,
  Brain,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Lock,
  User,
  Upload,
  Sparkles,
  Cpu,
  Terminal,
  Wand2,
  Atom,
  Globe,
  Star,
  FolderOpen,
  Download,
  RefreshCcw,
  Cloud,
  Link,
  Monitor,
  Smartphone,
  Laptop
} from 'lucide-react'
import { useAppStore, AVAILABLE_MODELS, type ModelId, PRESET_AVATARS, type AgentAvatarType } from '../../stores/appStore'
import { useSyncStore } from '../../stores/syncStore'
import { PromptShortcut } from '@/types/shortcut'
import { isValidCommandName } from '@/services/shortcuts/parser'

// Memory status type from API
interface MemoryStatusType {
  connected: boolean
  factCount: number
  preferenceCount: number
  summaryCount: number
  embeddingsEnabled: boolean
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface SettingsCardProps {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}

function SettingsCard({ icon, title, description, children }: SettingsCardProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.6) 0%, rgba(20, 28, 45, 0.7) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
            border: '1px solid rgba(0, 212, 255, 0.2)'
          }}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-white font-medium">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

/**
 * Cloud Sync Card Component
 * Handles device linking, sync status, and pairing
 */
function CloudSyncCard() {
  const {
    initialized,
    config,
    status,
    devices,
    pairingCode,
    linkingCode,
    linkingError,
    initialize,
    setEnabled,
    updateDeviceName,
    generatePairingCode,
    linkWithCode,
    setLinkingCode,
    removeDevice
  } = useSyncStore()

  const [showPairingModal, setShowPairingModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')

  // Initialize sync on mount
  useEffect(() => {
    if (!initialized) {
      initialize()
    }
  }, [initialized, initialize])

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Get device icon based on type
  const getDeviceIcon = (deviceType: string, platform: string | null) => {
    if (deviceType === 'mobile') return <Smartphone className="w-4 h-4" />
    if (platform === 'darwin') return <Laptop className="w-4 h-4" />
    return <Monitor className="w-4 h-4" />
  }

  const handleGeneratePairingCode = async () => {
    await generatePairingCode()
    setShowPairingModal(true)
  }

  const handleLinkWithCode = async () => {
    const success = await linkWithCode(linkingCode)
    if (success) {
      setShowLinkModal(false)
    }
  }

  const handleSaveDeviceName = async () => {
    if (newDeviceName.trim()) {
      await updateDeviceName(newDeviceName.trim())
      setEditingName(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.6) 0%, rgba(20, 28, 45, 0.7) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
            border: '1px solid rgba(0, 212, 255, 0.2)'
          }}
        >
          <Cloud className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-medium">Cloud Sync</h3>
          <p className="text-sm text-slate-500">Sync settings and conversations across devices</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm text-slate-300">Enable sync</label>
            <p className="text-xs text-slate-600">
              Automatically sync settings and conversations
            </p>
          </div>
          <button
            onClick={() => setEnabled(!config?.enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              config?.enabled ? 'bg-cyan-500' : 'bg-slate-600'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                config?.enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Sync Status */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status.connected ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <span className="text-sm text-slate-400">
              {status.connected
                ? `${status.deviceCount} device${status.deviceCount !== 1 ? 's' : ''} linked`
                : 'Not connected'}
            </span>
          </div>
          {status.lastSyncAt && (
            <span className="text-xs text-slate-600">
              Last sync: {formatRelativeTime(status.lastSyncAt)}
            </span>
          )}
        </div>

        {/* This Device */}
        {config && (
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getDeviceIcon(config.deviceType, config.platform)}
                {editingName ? (
                  <input
                    type="text"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    onBlur={handleSaveDeviceName}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveDeviceName()}
                    className="bg-slate-700 text-sm text-slate-200 px-2 py-1 rounded border border-cyan-500/50 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm text-slate-300">{config.deviceName}</span>
                )}
                <span className="text-xs text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
                  This device
                </span>
              </div>
              {!editingName && (
                <button
                  onClick={() => {
                    setNewDeviceName(config.deviceName)
                    setEditingName(true)
                  }}
                  className="text-slate-500 hover:text-slate-300 p-1"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Other Devices */}
        {devices.filter(d => d.id !== config?.deviceId).length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase tracking-wider">Other Devices</label>
            {devices
              .filter(d => d.id !== config?.deviceId)
              .map(device => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30"
                >
                  <div className="flex items-center gap-2">
                    {getDeviceIcon(device.device_type, device.platform)}
                    <span className="text-sm text-slate-400">{device.device_name || 'Unknown device'}</span>
                    <span className="text-xs text-slate-600">
                      {formatRelativeTime(device.last_seen)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeDevice(device.id)}
                    className="text-slate-600 hover:text-red-400 p-1"
                    title="Remove device"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Link Device Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleGeneratePairingCode}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors border border-cyan-500/30"
          >
            <Link className="w-4 h-4" />
            Link Another Device
          </button>
          <button
            onClick={() => setShowLinkModal(true)}
            className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors border border-white/10"
          >
            Enter Code
          </button>
        </div>
      </div>

      {/* Pairing Code Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.95) 0%, rgba(20, 28, 45, 0.98) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Link New Device</h3>
              <button
                onClick={() => setShowPairingModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-6">
              {pairingCode.generating ? (
                <div className="flex items-center justify-center gap-2 text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating code...
                </div>
              ) : pairingCode.code ? (
                <>
                  <p className="text-sm text-slate-400 mb-4">
                    Enter this code on the new device:
                  </p>
                  <div className="text-3xl font-mono font-bold text-cyan-400 tracking-wider mb-4">
                    {pairingCode.code}
                  </div>
                  {pairingCode.expiresAt && (
                    <p className="text-xs text-slate-600">
                      Code expires in 5 minutes
                    </p>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Failed to generate code</p>
              )}
            </div>

            <button
              onClick={handleGeneratePairingCode}
              className="w-full px-4 py-2 rounded-lg text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors border border-cyan-500/30"
            >
              <RefreshCw className="w-4 h-4 inline mr-2" />
              Generate New Code
            </button>
          </div>
        </div>
      )}

      {/* Link with Code Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.95) 0%, rgba(20, 28, 45, 0.98) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Enter Pairing Code</h3>
              <button
                onClick={() => {
                  setShowLinkModal(false)
                  setLinkingCode('')
                }}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Enter the pairing code from your other device:
              </p>

              <input
                type="text"
                value={linkingCode}
                onChange={(e) => setLinkingCode(e.target.value)}
                placeholder="XXXX-XXXX"
                className="w-full px-4 py-3 rounded-lg text-lg font-mono text-center text-white bg-slate-800/50 border border-slate-700 focus:border-cyan-500 focus:outline-none"
                maxLength={9}
              />

              {linkingError && (
                <p className="text-sm text-red-400">{linkingError}</p>
              )}

              <button
                onClick={handleLinkWithCode}
                disabled={linkingCode.length < 8}
                className="w-full px-4 py-2 rounded-lg text-sm text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Link Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    apiKey,
    setApiKey,
    selectedModel,
    setSelectedModel,
    maxTokens,
    setMaxTokens,
    customInstructions,
    setCustomInstructions,
    resetCustomInstructions,
    workspacePath,
    setWorkspacePath,
    memoryEnabled,
    setMemoryEnabled,
    memoryUserId,
    setMemoryUserId,
    generateMemoryUserId,
    memoryOpenaiKey,
    setMemoryOpenaiKey,
    shortcuts,
    addShortcut,
    removeShortcut,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    userProfilePicture,
    setUserProfilePicture,
    agentAvatarType,
    agentCustomAvatar,
    agentPresetAvatar,
    setAgentAvatarType,
    setAgentCustomAvatar,
    setAgentPresetAvatar,
    showContextUsage,
    setShowContextUsage,
    agentBypassPermissions,
    setAgentBypassPermissions
  } = useAppStore()

  const [showApiKey, setShowApiKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(false)
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatusType | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [importUserId, setImportUserId] = useState('')
  // API key validation state
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle')
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  // Shortcut editing state
  const [editingShortcut, setEditingShortcut] = useState<PromptShortcut | null>(null)
  const [isAddingShortcut, setIsAddingShortcut] = useState(false)
  const [shortcutForm, setShortcutForm] = useState({ name: '', description: '', prompt: '' })
  // Avatar state
  const [avatarTab, setAvatarTab] = useState<AgentAvatarType>(agentAvatarType)

  // App version state
  const [appVersion, setAppVersion] = useState<string>('...')

  // Update status
  const [updateStatus, setUpdateStatus] = useState<{
    checking: boolean
    available: boolean
    downloaded: boolean
    error: string | null
    version: string | null
    progress: number | null
  }>({
    checking: false,
    available: false,
    downloaded: false,
    error: null,
    version: null,
    progress: null
  })

  // Validate API key format
  const validateApiKeyFormat = (key: string): { valid: boolean; message?: string } => {
    if (!key) return { valid: false, message: 'API key is required' }
    if (!key.startsWith('sk-ant-')) {
      return { valid: false, message: 'API key should start with "sk-ant-"' }
    }
    if (key.length < 50) {
      return { valid: false, message: 'API key appears to be too short' }
    }
    return { valid: true }
  }

  // Test API key connection
  const testApiKey = async () => {
    const validation = validateApiKeyFormat(apiKey)
    if (!validation.valid) {
      setApiKeyStatus('invalid')
      setApiKeyError(validation.message || 'Invalid API key format')
      return
    }

    setApiKeyStatus('testing')
    setApiKeyError(null)

    try {
      // Simple test: try to create a minimal message
      const { Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

      // Make a minimal request to test the key
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })

      setApiKeyStatus('valid')
    } catch (error) {
      setApiKeyStatus('invalid')
      const err = error as { status?: number; message?: string }
      if (err.status === 401) {
        setApiKeyError('Invalid API key. Please check your key and try again.')
      } else if (err.status === 429) {
        setApiKeyError('Rate limited. Your API key is valid but you\'ve exceeded your quota.')
      } else {
        setApiKeyError(err.message || 'Failed to connect to Anthropic API')
      }
    }
  }

  // Reset API key status when key changes
  useEffect(() => {
    setApiKeyStatus('idle')
    setApiKeyError(null)
  }, [apiKey])

  // Fetch app version when modal opens
  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.app?.getVersion().then(version => {
        setAppVersion(version)
      }).catch(() => {
        setAppVersion('Unknown')
      })
    }
  }, [isOpen])

  // Set up update event listeners
  useEffect(() => {
    if (!isOpen) return

    // Get initial status
    window.electronAPI?.updater?.getStatus().then(setUpdateStatus)

    // Listen for update events
    const cleanup = window.electronAPI?.updater?.onUpdateEvent((event, data) => {
      switch (event) {
        case 'update-checking':
          setUpdateStatus(prev => ({ ...prev, checking: true, error: null }))
          break
        case 'update-available':
          setUpdateStatus(prev => ({
            ...prev,
            checking: false,
            available: true,
            version: (data as { version: string })?.version || null
          }))
          break
        case 'update-not-available':
          setUpdateStatus(prev => ({ ...prev, checking: false, available: false }))
          break
        case 'update-progress':
          setUpdateStatus(prev => ({
            ...prev,
            progress: (data as { percent: number })?.percent || null
          }))
          break
        case 'update-downloaded':
          setUpdateStatus(prev => ({
            ...prev,
            downloaded: true,
            progress: 100,
            version: (data as { version: string })?.version || prev.version
          }))
          break
        case 'update-error':
          setUpdateStatus(prev => ({
            ...prev,
            checking: false,
            error: (data as { error: string })?.error || 'Unknown error'
          }))
          break
      }
    })

    return () => cleanup?.()
  }, [isOpen])

  // Handle user profile picture upload
  const handleUserProfileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return
    }

    // Read and resize the image
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // Resize to max 200x200 for storage efficiency
        const canvas = document.createElement('canvas')
        const maxSize = 200
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          setUserProfilePicture(dataUrl)
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Handle agent custom avatar upload
  const handleAgentAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxSize = 200
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize
            width = maxSize
          } else {
            width = (width / height) * maxSize
            height = maxSize
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          setAgentCustomAvatar(dataUrl)
          setAgentAvatarType('custom')
          setAvatarTab('custom')
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Preset avatar icon component
  const PresetAvatarIcon = ({ iconName, size = 20 }: { iconName: string; size?: number }) => {
    const iconProps = { className: 'text-white', size }
    switch (iconName) {
      case 'Bot': return <Bot {...iconProps} />
      case 'Brain': return <Brain {...iconProps} />
      case 'Sparkles': return <Sparkles {...iconProps} />
      case 'Cpu': return <Cpu {...iconProps} />
      case 'Zap': return <Zap {...iconProps} />
      case 'Terminal': return <Terminal {...iconProps} />
      case 'Wand2': return <Wand2 {...iconProps} />
      case 'Atom': return <Atom {...iconProps} />
      case 'Globe': return <Globe {...iconProps} />
      case 'Star': return <Star {...iconProps} />
      default: return <Bot {...iconProps} />
    }
  }

  // Fetch conversation count and memory status when modal opens
  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.conversation.list().then((conversations) => {
        setConversationCount(conversations.length)
      })

      // Check memory status
      if (memoryEnabled && memoryUserId) {
        window.electronAPI?.memory.getStatus().then((status) => {
          setMemoryStatus(status)
          setEmbeddingsEnabled(status.embeddingsEnabled)
        }).catch(() => {
          setMemoryStatus(null)
        })
      }

      // Check embeddings status
      window.electronAPI?.memory.isEmbeddingsEnabled().then(setEmbeddingsEnabled).catch(() => {})
    }
  }, [isOpen, memoryEnabled, memoryUserId])

  // Set OpenAI key in backend when it changes
  useEffect(() => {
    if (memoryOpenaiKey) {
      window.electronAPI?.memory.setOpenaiKey(memoryOpenaiKey).then((result) => {
        setEmbeddingsEnabled(result.embeddingsEnabled)
      }).catch(() => {})
    }
  }, [memoryOpenaiKey])

  // Copy memory ID to clipboard
  const handleCopyMemoryId = async () => {
    if (memoryUserId) {
      await navigator.clipboard.writeText(memoryUserId)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  // Import memory ID from another device
  const handleImportMemoryId = () => {
    if (importUserId.trim() && importUserId.trim().length === 36) {
      setMemoryUserId(importUserId.trim())
      setImportUserId('')
    }
  }

  // Initialize memory connection
  const handleInitializeMemory = async () => {
    if (memoryUserId) {
      try {
        // Note: memory.initialize requires URL, anonKey, and anonymousId
        // For now, we just refresh the status since the backend handles initialization
        const status = await window.electronAPI?.memory.getStatus()
        if (status) {
          setMemoryStatus(status)
        }
      } catch (e) {
        console.error('Failed to initialize memory:', e)
      }
    }
  }

  if (!isOpen) return null

  const handleGetApiKey = () => {
    window.electronAPI?.shell.openExternal('https://console.anthropic.com/settings/keys')
  }

  const handleGetOpenaiKey = () => {
    window.electronAPI?.shell.openExternal('https://platform.openai.com/api-keys')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[700px] max-h-[85vh] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(20, 28, 45, 0.98) 0%, rgba(12, 16, 28, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
              }}
            >
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Settings</h2>
              <p className="text-sm text-slate-500">Configure your AssistantOS experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)] space-y-4">
          {/* Claude Settings */}
          <SettingsCard
            icon={<Bot className="w-5 h-5 text-cyan-400" />}
            title="Claude"
            description="AI assistant configuration"
          >
            {/* API Key */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">API Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className={`input-metallic w-full text-sm pr-10 ${
                      apiKeyStatus === 'valid' ? 'border-green-500/50' :
                      apiKeyStatus === 'invalid' ? 'border-red-500/50' : ''
                    }`}
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4 text-slate-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>
                <button
                  onClick={testApiKey}
                  disabled={!apiKey || apiKeyStatus === 'testing'}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                    apiKeyStatus === 'valid' ? 'text-green-400 bg-green-500/10' :
                    apiKeyStatus === 'invalid' ? 'text-red-400 bg-red-500/10' :
                    apiKeyStatus === 'testing' ? 'text-cyan-400 bg-cyan-500/10' :
                    'text-cyan-400 hover:bg-cyan-500/10'
                  } disabled:opacity-50`}
                >
                  {apiKeyStatus === 'testing' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : apiKeyStatus === 'valid' ? (
                    <>
                      <Check className="w-4 h-4" />
                      Valid
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Test
                    </>
                  )}
                </button>
                <button
                  onClick={handleGetApiKey}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Get Key
                </button>
              </div>
              {apiKeyError && (
                <p className="text-xs text-red-400 mt-1.5">{apiKeyError}</p>
              )}
              <p className="text-xs text-slate-600 mt-1.5">
                Your API key is stored locally and never sent to any server except Anthropic.
              </p>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="input-metallic w-full text-sm"
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id} className="bg-slate-900">
                    {model.name} {model.id === 'claude-sonnet-4-20250514' ? '(Recommended)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 20000)}
                min={1024}
                max={200000}
                className="input-metallic w-full text-sm"
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Maximum response length. Recommended: 20000+ for most tasks. Default: 20000.
              </p>
            </div>

            {/* Show Context Usage */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <label className="text-sm text-slate-300">Show context usage</label>
                <p className="text-xs text-slate-600">
                  Display token usage indicator in chat header
                </p>
              </div>
              <button
                onClick={() => setShowContextUsage(!showContextUsage)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  showContextUsage ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    showContextUsage ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Agent Bypass Permissions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <label className="text-sm text-slate-300">Bypass agent permissions</label>
                <p className="text-xs text-slate-600">
                  Allow agent to execute all actions without confirmation (recommended)
                </p>
              </div>
              <button
                onClick={() => setAgentBypassPermissions(!agentBypassPermissions)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  agentBypassPermissions ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    agentBypassPermissions ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </SettingsCard>

          {/* Profile & Avatars */}
          <SettingsCard
            icon={<User className="w-5 h-5 text-pink-400" />}
            title="Profile & Avatars"
            description="Customize your appearance and agent avatar"
          >
            {/* User Profile Picture */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Your Profile Picture</label>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{
                    background: userProfilePicture
                      ? 'transparent'
                      : 'linear-gradient(180deg, rgba(50, 60, 80, 0.8) 0%, rgba(35, 45, 65, 0.9) 100%)',
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 0 15px rgba(236, 72, 153, 0.2)'
                  }}
                >
                  {userProfilePicture ? (
                    <img
                      src={userProfilePicture}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-slate-400" />
                  )}
                </div>

                {/* Upload and Clear buttons */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 px-3 py-2 text-sm text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg transition-colors cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUserProfileUpload}
                      className="hidden"
                    />
                  </label>
                  {userProfilePicture && (
                    <button
                      onClick={() => setUserProfilePicture(null)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Appears next to your messages in chat. Recommended: square image.
              </p>
            </div>

            {/* Agent Avatar */}
            <div className="border-t border-white/5 pt-4">
              <label className="block text-sm text-slate-400 mb-2">Agent Avatar</label>

              {/* Avatar Type Tabs */}
              <div className="flex gap-1 mb-3 p-1 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                {(['default', 'preset', 'custom'] as AgentAvatarType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setAvatarTab(type)
                      setAgentAvatarType(type)
                    }}
                    className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-all ${
                      avatarTab === type
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>

              {/* Default Tab Content */}
              {avatarTab === 'default' && (
                <div className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                      boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
                    }}
                  >
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-white">Default Claude Avatar</p>
                    <p className="text-xs text-slate-500">The classic cyan-purple gradient bot icon</p>
                  </div>
                </div>
              )}

              {/* Preset Tab Content */}
              {avatarTab === 'preset' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_AVATARS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setAgentPresetAvatar(preset.id)
                          setAgentAvatarType('preset')
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                          agentPresetAvatar === preset.id && agentAvatarType === 'preset'
                            ? 'bg-cyan-500/20 border border-cyan-500/40'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                        title={preset.label}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                            boxShadow: agentPresetAvatar === preset.id && agentAvatarType === 'preset'
                              ? '0 0 15px rgba(0, 212, 255, 0.4)'
                              : 'none'
                          }}
                        >
                          <PresetAvatarIcon iconName={preset.icon} size={20} />
                        </div>
                        <span className="text-[10px] text-slate-400">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Tab Content */}
              {avatarTab === 'custom' && (
                <div className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                  {/* Preview */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{
                      background: agentCustomAvatar
                        ? 'transparent'
                        : 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                      border: '2px solid rgba(0, 212, 255, 0.3)',
                      boxShadow: '0 0 15px rgba(0, 212, 255, 0.2)'
                    }}
                  >
                    {agentCustomAvatar ? (
                      <img
                        src={agentCustomAvatar}
                        alt="Agent Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Bot className="w-6 h-6 text-white" />
                    )}
                  </div>

                  {/* Upload and Clear buttons */}
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors cursor-pointer">
                      <Upload className="w-4 h-4" />
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAgentAvatarUpload}
                        className="hidden"
                      />
                    </label>
                    {agentCustomAvatar && (
                      <button
                        onClick={() => setAgentCustomAvatar(null)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SettingsCard>

          {/* Custom Instructions */}
          <SettingsCard
            icon={<FileText className="w-5 h-5 text-violet-400" />}
            title="Custom Instructions"
            description="Personalize Claude's behavior"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-slate-400">Your instructions</label>
                <button
                  onClick={resetCustomInstructions}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to defaults
                </button>
              </div>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Add custom instructions to personalize Claude..."
                rows={8}
                className="input-metallic w-full text-sm resize-y min-h-[120px]"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              />
              <p className="text-xs text-slate-600 mt-1.5">
                These instructions are added to every conversation. Use Markdown formatting.
              </p>
            </div>
          </SettingsCard>

          {/* Prompt Shortcuts */}
          <SettingsCard
            icon={<Zap className="w-5 h-5 text-purple-400" />}
            title="Prompt Shortcuts"
            description="Create slash commands that expand into prompts"
          >
            <div className="space-y-3">
              {/* Shortcut List */}
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-white/5"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div className="flex-shrink-0">
                    {shortcut.isBuiltIn ? (
                      <span title="Built-in shortcut"><Lock className="w-4 h-4 text-slate-500" /></span>
                    ) : (
                      <Zap className="w-4 h-4 text-purple-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-medium text-purple-400">/{shortcut.name}</code>
                    <p className="text-xs text-slate-500 truncate">{shortcut.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingShortcut(shortcut)
                        setShortcutForm({
                          name: shortcut.name,
                          description: shortcut.description,
                          prompt: shortcut.prompt
                        })
                      }}
                      className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                      title="Edit shortcut"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {shortcut.isBuiltIn ? (
                      <button
                        onClick={() => resetShortcut(shortcut.id)}
                        className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                        title="Reset to default"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => removeShortcut(shortcut.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete shortcut"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add Shortcut Button */}
              <button
                onClick={() => {
                  setIsAddingShortcut(true)
                  setShortcutForm({ name: '', description: '', prompt: '' })
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add Shortcut</span>
              </button>

              {/* Edit/Add Form */}
              {(editingShortcut || isAddingShortcut) && (
                <div
                  className="p-4 rounded-lg space-y-3"
                  style={{
                    background: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.3)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-purple-300">
                      {editingShortcut ? 'Edit Shortcut' : 'New Shortcut'}
                    </h4>
                    <button
                      onClick={() => {
                        setEditingShortcut(null)
                        setIsAddingShortcut(false)
                        setShortcutForm({ name: '', description: '', prompt: '' })
                      }}
                      className="p-1 text-slate-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Name field (only for new shortcuts) */}
                  {isAddingShortcut && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Command name</label>
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400 font-mono">/</span>
                        <input
                          type="text"
                          value={shortcutForm.name}
                          onChange={(e) => setShortcutForm(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                          placeholder="my-command"
                          className="input-metallic flex-1 text-sm font-mono"
                          maxLength={30}
                        />
                      </div>
                      {shortcutForm.name && !isValidCommandName(shortcutForm.name) && (
                        <p className="text-xs text-red-400 mt-1">Use only letters, numbers, and hyphens</p>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={shortcutForm.description}
                      onChange={(e) => setShortcutForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="What this shortcut does..."
                      className="input-metallic w-full text-sm"
                      maxLength={100}
                    />
                  </div>

                  {/* Prompt */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Prompt</label>
                    <textarea
                      value={shortcutForm.prompt}
                      onChange={(e) => setShortcutForm(prev => ({ ...prev, prompt: e.target.value }))}
                      placeholder="The prompt that will be expanded when you use this command..."
                      rows={4}
                      className="input-metallic w-full text-sm resize-y min-h-[80px]"
                    />
                  </div>

                  {/* Save/Cancel */}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setEditingShortcut(null)
                        setIsAddingShortcut(false)
                        setShortcutForm({ name: '', description: '', prompt: '' })
                      }}
                      className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (editingShortcut) {
                          updateShortcut(editingShortcut.id, {
                            description: shortcutForm.description,
                            prompt: shortcutForm.prompt
                          })
                          setEditingShortcut(null)
                        } else if (isAddingShortcut && isValidCommandName(shortcutForm.name)) {
                          addShortcut({
                            name: shortcutForm.name,
                            description: shortcutForm.description,
                            prompt: shortcutForm.prompt
                          })
                          setIsAddingShortcut(false)
                        }
                        setShortcutForm({ name: '', description: '', prompt: '' })
                      }}
                      disabled={
                        (!editingShortcut && !isValidCommandName(shortcutForm.name)) ||
                        !shortcutForm.description.trim() ||
                        !shortcutForm.prompt.trim()
                      }
                      className="px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-400 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingShortcut ? 'Save Changes' : 'Add Shortcut'}
                    </button>
                  </div>
                </div>
              )}

              {/* Reset All */}
              <div className="flex justify-end pt-2 border-t border-white/5">
                <button
                  onClick={resetAllShortcuts}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset all to defaults
                </button>
              </div>
            </div>
          </SettingsCard>

          {/* Kanban Board */}
          <SettingsCard
            icon={<CheckSquare className="w-5 h-5 text-emerald-400" />}
            title="Kanban Board"
            description="Task management via standardized TASKS folder"
          >
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-sm text-slate-300 mb-2">
                  Tasks are organized in a standardized folder structure:
                </p>
                <code className="text-xs text-cyan-400 block">
                  TASKS/ProjectName/tasks.md
                </code>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <p><strong className="text-slate-400">Checkbox syntax:</strong></p>
                <p><code className="text-slate-400">- [ ]</code> Backlog</p>
                <p><code className="text-blue-400">- [o]</code> Todo</p>
                <p><code className="text-amber-400">- [&gt;]</code> In Progress</p>
                <p><code className="text-purple-400">- [?]</code> In Review</p>
                <p><code className="text-emerald-400">- [x]</code> Done</p>
              </div>
            </div>
          </SettingsCard>

          {/* Memory */}
          <SettingsCard
            icon={<Brain className="w-5 h-5 text-amber-400" />}
            title="Persistent Memory"
            description="Remember facts and preferences across sessions"
          >
            {/* Enable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-slate-300">Enable memory</label>
                <p className="text-xs text-slate-600">
                  Store user facts, preferences, and conversation summaries
                </p>
              </div>
              <button
                onClick={() => setMemoryEnabled(!memoryEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  memoryEnabled ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    memoryEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {memoryEnabled && (
              <>
                {/* OpenAI API Key (for embeddings) */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">
                    OpenAI API Key
                    <span className="text-xs text-slate-600 ml-2">(optional, for semantic search)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showOpenaiKey ? 'text' : 'password'}
                        value={memoryOpenaiKey}
                        onChange={(e) => setMemoryOpenaiKey(e.target.value)}
                        placeholder="sk-..."
                        className="input-metallic w-full text-sm pr-10"
                      />
                      <button
                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        {showOpenaiKey ? (
                          <EyeOff className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Eye className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={handleGetOpenaiKey}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Get Key
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        embeddingsEnabled ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <p className="text-xs text-slate-600">
                      {embeddingsEnabled
                        ? 'Semantic search enabled - memories are searchable by meaning'
                        : 'Add OpenAI key for smarter memory retrieval via embeddings'}
                    </p>
                  </div>
                </div>

                {/* Memory ID */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Your Memory ID</label>
                  <div className="flex gap-2">
                    <div
                      className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-300 truncate font-mono"
                      style={{
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      {memoryUserId || 'Not generated'}
                    </div>
                    {memoryUserId ? (
                      <button
                        onClick={handleCopyMemoryId}
                        className="px-3 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                      >
                        {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    ) : (
                      <button
                        onClick={generateMemoryUserId}
                        className="px-3 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                      >
                        Generate
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">
                    Copy this ID to sync memories across devices.
                  </p>
                </div>

                {/* Import Memory ID */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Import Memory ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importUserId}
                      onChange={(e) => setImportUserId(e.target.value)}
                      placeholder="Paste ID from another device..."
                      className="input-metallic flex-1 text-sm font-mono"
                    />
                    <button
                      onClick={handleImportMemoryId}
                      disabled={!importUserId.trim() || importUserId.trim().length !== 36}
                      className="px-3 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Import
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">
                    Warning: Importing will link this device to the imported memory profile.
                  </p>
                </div>

                {/* Connection Status / Initialize */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        memoryStatus?.connected ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-sm text-slate-400">
                      {memoryStatus?.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <button
                    onClick={handleInitializeMemory}
                    disabled={!memoryUserId}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Connect
                  </button>
                </div>
              </>
            )}
          </SettingsCard>

          {/* Cloud Sync */}
          <CloudSyncCard />

          {/* Storage */}
          <SettingsCard
            icon={<HardDrive className="w-5 h-5 text-pink-400" />}
            title="Storage"
            description="Manage local data"
          >
            {/* Workspace */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Current Workspace</label>
              <div className="flex gap-2">
                <div
                  className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-300 truncate"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  {workspacePath || 'No workspace selected'}
                </div>
                <button
                  onClick={async () => {
                    try {
                      const folderPath = await window.electronAPI.fs.selectFolder()
                      if (folderPath) {
                        setWorkspacePath(folderPath)
                      }
                    } catch (error) {
                      console.error('Failed to select folder:', error)
                    }
                  }}
                  className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                  Select
                </button>
              </div>
            </div>

            {/* Conversations */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Conversations</label>
              <div
                className="px-3 py-2 rounded-lg text-sm text-slate-300"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                {conversationCount} saved conversation{conversationCount !== 1 ? 's' : ''}
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                Use the chat toolbar to save, load, and export conversations.
              </p>
            </div>
          </SettingsCard>

          {/* Updates */}
          <SettingsCard
            icon={<Download className="w-5 h-5 text-emerald-400" />}
            title="Updates"
            description="Check for app updates"
          >
            {/* Current Version */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Current Version</label>
              <div
                className="px-3 py-2 rounded-lg text-sm text-slate-300"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                v{appVersion}
              </div>
            </div>

            {/* Update Status */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Status</label>
              <div
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                {updateStatus.checking && (
                  <span className="text-cyan-400 flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    Checking for updates...
                  </span>
                )}
                {updateStatus.downloaded && (
                  <span className="text-emerald-400">
                    Update v{updateStatus.version} ready to install! Restart to apply.
                  </span>
                )}
                {updateStatus.available && !updateStatus.downloaded && (
                  <span className="text-amber-400">
                    Update v{updateStatus.version} available
                    {updateStatus.progress !== null && ` (${Math.round(updateStatus.progress)}%)`}
                  </span>
                )}
                {updateStatus.error && (
                  <span className="text-red-400">{updateStatus.error}</span>
                )}
                {!updateStatus.checking && !updateStatus.available && !updateStatus.downloaded && !updateStatus.error && (
                  <span className="text-slate-500">You're on the latest version</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setUpdateStatus(prev => ({ ...prev, checking: true, error: null }))
                  try {
                    // [Bug Fix] Check the return value for errors
                    const result = await window.electronAPI?.updater?.checkForUpdates()
                    if (result && !result.success) {
                      // IPC handler returned an error
                      setUpdateStatus(prev => ({
                        ...prev,
                        checking: false,
                        error: result.error || 'Update check failed'
                      }))
                    }
                  } catch (error) {
                    // [Bug Fix] Also handle exceptions
                    console.error('[Settings] Update check error:', error)
                    setUpdateStatus(prev => ({
                      ...prev,
                      checking: false,
                      error: (error as Error).message || 'Update check failed'
                    }))
                  }
                }}
                disabled={updateStatus.checking}
                className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-50"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <RefreshCcw className={`w-4 h-4 ${updateStatus.checking ? 'animate-spin' : ''}`} />
                Check for Updates
              </button>

              {updateStatus.downloaded && (
                <button
                  onClick={() => window.electronAPI?.updater?.installUpdate()}
                  className="px-3 py-2 rounded-lg text-sm text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Restart & Update
                </button>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Updates are downloaded automatically and installed when you restart the app.
            </p>
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
