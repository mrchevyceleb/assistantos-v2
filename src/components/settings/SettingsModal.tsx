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
  CheckSquare
} from 'lucide-react'
import { useAppStore, AVAILABLE_MODELS, type ModelId, DEFAULT_CUSTOM_INSTRUCTIONS } from '../../stores/appStore'
import { TaskSourceFolderPicker } from './TaskSourceFolderPicker'

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
    setTaskSettings
  } = useAppStore()

  const [showApiKey, setShowApiKey] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)

  // Fetch conversation count when modal opens
  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.conversation.list().then((conversations) => {
        setConversationCount(conversations.length)
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleGetApiKey = () => {
    window.electronAPI?.shell.openExternal('https://console.anthropic.com/settings/keys')
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

          {/* Task Sources */}
          <SettingsCard
            icon={<CheckSquare className="w-5 h-5 text-emerald-400" />}
            title="Task Sources"
            description="Configure which folders to scan for tasks"
          >
            {/* Scan Mode Toggle */}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Scan mode</label>
              <select
                value={taskSettings.scanEntireWorkspace !== false ? 'all' : 'specific'}
                onChange={(e) => setTaskSettings({
                  scanEntireWorkspace: e.target.value === 'all'
                })}
                className="input-metallic w-full text-sm"
              >
                <option value="all" className="bg-slate-900">Entire workspace</option>
                <option value="specific" className="bg-slate-900">Specific folders only</option>
              </select>
              <p className="text-xs text-slate-600 mt-1.5">
                {taskSettings.scanEntireWorkspace !== false
                  ? 'Scanning all markdown files in your workspace for tasks.'
                  : 'Only scanning specified folders for tasks.'}
              </p>
            </div>

            {/* Folder Picker (shown when specific folders selected) */}
            {taskSettings.scanEntireWorkspace === false && (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Task folders</label>
                <TaskSourceFolderPicker
                  paths={taskSettings.taskSourcePaths || []}
                  onChange={(paths) => setTaskSettings({ taskSourcePaths: paths })}
                />
                <p className="text-xs text-slate-600 mt-1.5">
                  Paths are relative to your workspace root.
                </p>
              </div>
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
