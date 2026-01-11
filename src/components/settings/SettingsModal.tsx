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
  RefreshCw
} from 'lucide-react'
import { useAppStore, AVAILABLE_MODELS, type ModelId, DEFAULT_CUSTOM_INSTRUCTIONS } from '../../stores/appStore'
// TaskSourceFolderPicker removed - now using standardized TASKS folder

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
    taskSettings,
    setTaskSettings,
    memoryEnabled,
    setMemoryEnabled,
    memorySupabaseUrl,
    setMemorySupabaseUrl,
    memorySupabaseAnonKey,
    setMemorySupabaseAnonKey,
    memoryUserId,
    setMemoryUserId,
    generateMemoryUserId,
    memoryOpenaiKey,
    setMemoryOpenaiKey
  } = useAppStore()

  const [showApiKey, setShowApiKey] = useState(false)
  const [showSupabaseKey, setShowSupabaseKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(false)
  const [memoryStatus, setMemoryStatus] = useState<{ initialized: boolean; connected: boolean } | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [importUserId, setImportUserId] = useState('')

  // Fetch conversation count and memory status when modal opens
  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.conversation.list().then((conversations) => {
        setConversationCount(conversations.length)
      })

      // Check memory status
      if (memoryEnabled && memorySupabaseUrl && memorySupabaseAnonKey && memoryUserId) {
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
  }, [isOpen, memoryEnabled, memorySupabaseUrl, memorySupabaseAnonKey, memoryUserId])

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
    if (memorySupabaseUrl && memorySupabaseAnonKey && memoryUserId) {
      try {
        const result = await window.electronAPI?.memory.initialize({
          supabaseUrl: memorySupabaseUrl,
          supabaseAnonKey: memorySupabaseAnonKey,
          userId: memoryUserId
        })
        if (result?.success) {
          setMemoryStatus({ initialized: true, connected: true })
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
                    className="input-metallic w-full text-sm pr-10"
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
                  onClick={handleGetApiKey}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Get Key
                </button>
              </div>
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
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 8192)}
                min={1024}
                max={200000}
                className="input-metallic w-full text-sm"
              />
              <p className="text-xs text-slate-600 mt-1.5">
                Maximum response length. Recommended: 8192-16384 for most tasks.
              </p>
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
                {/* Supabase URL */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Supabase URL</label>
                  <input
                    type="text"
                    value={memorySupabaseUrl}
                    onChange={(e) => setMemorySupabaseUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="input-metallic w-full text-sm"
                  />
                </div>

                {/* Supabase Anon Key */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Supabase Anon Key</label>
                  <div className="relative">
                    <input
                      type={showSupabaseKey ? 'text' : 'password'}
                      value={memorySupabaseAnonKey}
                      onChange={(e) => setMemorySupabaseAnonKey(e.target.value)}
                      placeholder="eyJ..."
                      className="input-metallic w-full text-sm pr-10"
                    />
                    <button
                      onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      {showSupabaseKey ? (
                        <EyeOff className="w-4 h-4 text-slate-500" />
                      ) : (
                        <Eye className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                  </div>
                </div>

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
                    disabled={!memorySupabaseUrl || !memorySupabaseAnonKey || !memoryUserId}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Connect
                  </button>
                </div>
              </>
            )}
          </SettingsCard>

          {/* Storage */}
          <SettingsCard
            icon={<HardDrive className="w-5 h-5 text-pink-400" />}
            title="Storage"
            description="Manage local data"
          >
            {/* Workspace */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Current Workspace</label>
              <div
                className="px-3 py-2 rounded-lg text-sm text-slate-300 truncate"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                {workspacePath || 'No workspace selected'}
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
        </div>
      </div>
    </div>
  )
}
