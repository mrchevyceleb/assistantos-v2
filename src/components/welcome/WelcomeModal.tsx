/**
 * Welcome Modal
 * Shows on first launch to guide users through initial setup:
 * 1. API Key configuration
 * 2. Workspace selection/creation
 */

import { useState } from 'react'
import { Sparkles, Key, Folder, ArrowRight, Check, ExternalLink, FolderPlus } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

type SetupStep = 'welcome' | 'api-key' | 'workspace' | 'complete'

export function WelcomeModal() {
  const {
    apiKey,
    setApiKey,
    workspacePath,
    setWorkspacePath,
    hasCompletedSetup,
    setHasCompletedSetup,
  } = useAppStore()

  const [step, setStep] = useState<SetupStep>('welcome')
  const [tempApiKey, setTempApiKey] = useState(apiKey || '')
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)

  // Don't show if setup is already complete
  if (hasCompletedSetup) {
    return null
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.fs?.selectFolder) return

    try {
      const path = await window.electronAPI.fs.selectFolder()
      if (path) {
        setWorkspacePath(path)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!window.electronAPI?.fs?.selectFolder) return

    setIsCreatingWorkspace(true)
    try {
      // First select parent folder
      const parentPath = await window.electronAPI.fs.selectFolder()
      if (!parentPath) {
        setIsCreatingWorkspace(false)
        return
      }

      // Create AssistantOS workspace folder with structure
      const workspaceName = 'AssistantOS-Workspace'
      const newWorkspacePath = `${parentPath.replace(/\\/g, '/')}/${workspaceName}`

      // Create main folder
      await window.electronAPI.fs.createDir(newWorkspacePath)

      // Create recommended structure
      const folders = [
        'TASKS',
        '00-Inbox',
        '01-Active',
        '02-Someday',
        '03-Reference',
        '04-Archive',
        'Templates',
      ]

      for (const folder of folders) {
        await window.electronAPI.fs.createDir(`${newWorkspacePath}/${folder}`)
      }

      // Create README
      await window.electronAPI.fs.writeFile(
        `${newWorkspacePath}/README.md`,
        `# My AssistantOS Workspace

Welcome to your personal workspace! This folder is organized for productivity:

- **TASKS/** - Your task files (Kanban-style task management)
- **00-Inbox/** - Quick capture for new items
- **01-Active/** - Current projects and focus areas
- **02-Someday/** - Future ideas and possibilities
- **03-Reference/** - Documentation and resources
- **04-Archive/** - Completed work
- **Templates/** - Reusable templates

## Getting Started

1. Add tasks to your TASKS folder
2. Use @mentions to reference files in chat
3. Ask your AI assistant to help organize your work

Enjoy! 🚀
`
      )

      setWorkspacePath(newWorkspacePath)
    } catch (error) {
      console.error('Failed to create workspace:', error)
    } finally {
      setIsCreatingWorkspace(false)
    }
  }

  const handleSaveApiKey = () => {
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey.trim())
      setStep('workspace')
    }
  }

  const handleComplete = () => {
    setHasCompletedSetup(true)
  }

  const handleSkipToChat = () => {
    setHasCompletedSetup(true)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 24, 36, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)',
        }}
      >
        {/* Header gradient */}
        <div
          className="h-2"
          style={{
            background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 50%, #ec4899 100%)',
          }}
        />

        <div className="p-8">
          {/* Welcome Step */}
          {step === 'welcome' && (
            <div className="text-center">
              <div
                className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                  boxShadow: '0 0 30px rgba(0, 212, 255, 0.4)',
                }}
              >
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-3">
                Welcome to AssistantOS
              </h1>
              <p className="text-slate-400 mb-8 text-lg">
                Your personal AI executive assistant. Let's get you set up in just a minute.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setStep('api-key')}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-medium transition-all hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                    boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                  }}
                >
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSkipToChat}
                  className="w-full px-6 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
                >
                  Skip setup for now
                </button>
              </div>
            </div>
          )}

          {/* API Key Step */}
          {step === 'api-key' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(0, 212, 255, 0.15)' }}
                >
                  <Key className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Connect to Claude</h2>
                  <p className="text-sm text-slate-400">Enter your Anthropic API key</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                  />
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Get your API key from Anthropic Console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('welcome')}
                    className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSaveApiKey}
                    disabled={!tempApiKey.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                    style={{
                      background: tempApiKey.trim()
                        ? 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => setStep('workspace')}
                  className="w-full text-center text-sm text-slate-500 hover:text-slate-300"
                >
                  Skip - I'll add it later in Settings
                </button>
              </div>
            </div>
          )}

          {/* Workspace Step */}
          {step === 'workspace' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(124, 58, 237, 0.15)' }}
                >
                  <Folder className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Choose Your Workspace</h2>
                  <p className="text-sm text-slate-400">Where should we store your files?</p>
                </div>
              </div>

              {workspacePath ? (
                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl"
                    style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    <Check className="w-5 h-5 text-green-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">Workspace Selected</div>
                      <div className="text-xs text-slate-400 truncate">{workspacePath}</div>
                    </div>
                  </div>

                  <button
                    onClick={handleComplete}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-medium transition-all hover:scale-[1.02]"
                    style={{
                      background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                      boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                    }}
                  >
                    Start Using AssistantOS
                    <Sparkles className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={isCreatingWorkspace}
                    className="w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/5"
                    style={{ border: '1px solid rgba(0, 212, 255, 0.3)' }}
                  >
                    <FolderPlus className="w-5 h-5 text-cyan-400 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {isCreatingWorkspace ? 'Creating...' : 'Create New Workspace'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Set up a new folder with recommended structure
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handleSelectFolder}
                    className="w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/5"
                    style={{ border: '1px solid rgba(124, 58, 237, 0.3)' }}
                  >
                    <Folder className="w-5 h-5 text-violet-400 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">Select Existing Folder</div>
                      <div className="text-xs text-slate-400">
                        Use a folder you already have
                      </div>
                    </div>
                  </button>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setStep('api-key')}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleComplete}
                      className="flex-1 text-center text-sm text-slate-500 hover:text-slate-300"
                    >
                      Skip - I'll choose later
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 pb-6">
          {['welcome', 'api-key', 'workspace'].map((s) => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background:
                  step === s
                    ? 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)'
                    : 'rgba(255, 255, 255, 0.2)',
                boxShadow: step === s ? '0 0 8px rgba(0, 212, 255, 0.5)' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
