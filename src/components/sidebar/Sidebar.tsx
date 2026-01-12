import { useState, useCallback } from 'react'
import { Settings, LayoutDashboard, ListTodo } from 'lucide-react'
import { AgentSection } from './AgentSection'
import { FilesSection } from './FilesSection'
import { QuickNotesSection } from './QuickNotesSection'
import { ChatHistorySection } from './ChatHistorySection'
import { MCPIndicators } from './MCPIndicators'
import { SettingsModal } from '../settings/SettingsModal'
import { IntegrationsModal } from '../settings/IntegrationsModal'
import { useTabStore } from '@/stores/tabStore'
import { useAgentStore, Message } from '@/stores/agentStore'
import { loadConversation, conversationToMessages } from '@/services/chatHistory/chatHistoryService'
import { ModelId, AVAILABLE_MODELS, DEFAULT_MODEL } from '@/stores/appStore'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className = '' }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showIntegrations, setShowIntegrations] = useState(false)
  const openOrFocusDashboard = useTabStore(state => state.openOrFocusDashboard)
  const openOrFocusTasks = useTabStore(state => state.openOrFocusTasks)
  const openOrFocusAgent = useTabStore(state => state.openOrFocusAgent)
  const activeTab = useTabStore(state => state.getActiveTab())

  // Agent store methods for loading conversations
  const createAgentWithConversation = useAgentStore(state => state.createAgentWithConversation)
  const findAgentByConversationId = useAgentStore(state => state.findAgentByConversationId)
  const setActiveAgent = useAgentStore(state => state.setActiveAgent)
  const canCreateAgent = useAgentStore(state => state.canCreateAgent)

  // Get active conversation ID if current tab is an agent
  const activeConversationId = activeTab?.type === 'agent' && activeTab.agentId
    ? useAgentStore.getState().getAgent(activeTab.agentId)?.conversationId
    : null

  // Handle loading a conversation from history
  const handleLoadConversation = useCallback(async (conversationId: string) => {
    // Check if this conversation is already open in an agent
    const existingAgent = findAgentByConversationId(conversationId)
    if (existingAgent) {
      // Focus the existing agent
      setActiveAgent(existingAgent.id)
      openOrFocusAgent(existingAgent.id, existingAgent.name)
      return
    }

    // Check if we can create a new agent
    if (!canCreateAgent()) {
      console.warn('[ChatHistory] Cannot load conversation: max agents reached')
      return
    }

    // Load the conversation
    const conversation = await loadConversation(conversationId)
    if (!conversation) {
      console.error('[ChatHistory] Failed to load conversation:', conversationId)
      return
    }

    // Convert messages to the correct format
    const messages: Message[] = conversationToMessages(conversation)

    // Validate and get model ID
    const modelId: ModelId = AVAILABLE_MODELS.some(m => m.id === conversation.model)
      ? conversation.model as ModelId
      : DEFAULT_MODEL

    // Create a new agent with the loaded conversation
    const newAgentId = createAgentWithConversation({
      conversationId: conversation.id,
      title: conversation.title,
      model: modelId,
      messages,
    })

    if (newAgentId) {
      // Open/focus the new agent tab
      openOrFocusAgent(newAgentId, conversation.title)
    }
  }, [findAgentByConversationId, setActiveAgent, openOrFocusAgent, canCreateAgent, createAgentWithConversation])

  return (
    <>
      <aside
        className={`
          flex flex-col
          w-[220px] min-w-[220px] h-full
          bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95
          border-r border-white/5
          overflow-hidden
          ${className}
        `}
      >
        {/* App Header */}
        <div className="px-4 py-4 border-b border-white/5 flex-shrink-0">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            AssistantOS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI Executive Assistant
          </p>
        </div>

        {/* Dashboard Section */}
        <button
          onClick={() => openOrFocusDashboard()}
          className={`
            w-full flex items-center gap-3 px-4 py-3
            text-sm transition-colors flex-shrink-0
            border-b border-white/5
            ${activeTab?.type === 'dashboard'
              ? 'text-cyan-400 bg-cyan-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        {/* Agent Section */}
        <AgentSection />

        {/* Chat History Section */}
        <ChatHistorySection
          onLoadConversation={handleLoadConversation}
          activeConversationId={activeConversationId}
        />

        {/* Tasks Section */}
        <button
          onClick={() => openOrFocusTasks()}
          className={`
            w-full flex items-center gap-3 px-4 py-3
            text-sm transition-colors flex-shrink-0
            border-b border-white/5
            ${activeTab?.type === 'tasks'
              ? 'text-violet-400 bg-violet-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <ListTodo className="w-4 h-4" />
          <span>Tasks</span>
        </button>

        {/* Quick Notes Section */}
        <QuickNotesSection />

        {/* Files Section - Collapsible, takes remaining space */}
        <FilesSection />

        {/* Bottom Section - Settings & MCPs */}
        <div className="border-t border-white/5 flex-shrink-0">
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
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      )}
      {showIntegrations && (
        <IntegrationsModal isOpen={showIntegrations} onClose={() => setShowIntegrations(false)} />
      )}
    </>
  )
}
