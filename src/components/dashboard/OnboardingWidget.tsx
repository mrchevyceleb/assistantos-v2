/**
 * Onboarding Widget
 * Shows setup CTA for new workspaces, allows users to trigger AI-guided workspace setup
 */

import { useState } from 'react'
import { Sparkles, Folder, Zap, CheckCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WORKSPACE_SETUP_PROMPT, QUICK_SETUP_PROMPT } from '../../services/onboardingPrompt'

export function OnboardingWidget() {
  const {
    workspacePath,
    isWorkspaceOnboarded,
    markWorkspaceOnboarded,
    setPendingChatPrompt,
    setCenterPanelView
  } = useAppStore()

  const [showOptions, setShowOptions] = useState(false)

  // Don't show if no workspace or already onboarded
  if (!workspacePath || isWorkspaceOnboarded(workspacePath)) {
    return null
  }

  const handleGuidedSetup = () => {
    setPendingChatPrompt(WORKSPACE_SETUP_PROMPT)
    setCenterPanelView('editor') // Focus on chat
    setShowOptions(false)
  }

  const handleQuickSetup = () => {
    setPendingChatPrompt(QUICK_SETUP_PROMPT)
    setCenterPanelView('editor') // Focus on chat
    setShowOptions(false)
  }

  const handleSkip = () => {
    markWorkspaceOnboarded(workspacePath)
    setShowOptions(false)
  }

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.2)'
      }}
    >
      {/* Decorative gradient */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 100% 0%, rgba(0, 212, 255, 0.2) 0%, transparent 50%)'
        }}
      />

      <div className="relative">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)'
            }}
          >
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">
              Set Up Your Workspace
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Let AI help you create an organized folder structure tailored to how you work.
            </p>

            {!showOptions ? (
              <button
                onClick={() => setShowOptions(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                  boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
                }}
              >
                <Folder className="w-4 h-4" />
                Setup My Workspace
              </button>
            ) : (
              <div className="space-y-3">
                {/* Guided Setup */}
                <button
                  onClick={handleGuidedSetup}
                  className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(0, 212, 255, 0.3)' }}
                >
                  <Sparkles className="w-5 h-5 text-cyan-400 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">Guided Setup</div>
                    <div className="text-xs text-slate-400">
                      AI asks about your work style and creates a personalized structure
                    </div>
                  </div>
                </button>

                {/* Quick Setup */}
                <button
                  onClick={handleQuickSetup}
                  className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all hover:bg-white/5"
                  style={{ border: '1px solid rgba(124, 58, 237, 0.3)' }}
                >
                  <Zap className="w-5 h-5 text-violet-400 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-white">Quick Setup</div>
                    <div className="text-xs text-slate-400">
                      Instantly create a standard productivity folder structure
                    </div>
                  </div>
                </button>

                {/* Skip */}
                <button
                  onClick={handleSkip}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  I'll organize it myself
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
