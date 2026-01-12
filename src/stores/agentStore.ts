import { create } from 'zustand'
import { ModelId, DEFAULT_MODEL } from './appStore'

// Message type - matches the existing Message interface in AgentChat
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
}

// Agent status indicators
export type AgentStatus = 'idle' | 'working' | 'queued' | 'error'

// Queued message (sent during streaming)
export interface QueuedMessage {
  id: string
  content: string
  timestamp: Date
}

// Individual agent state
export interface Agent {
  id: string
  name: string                    // Auto-generated from first prompt
  status: AgentStatus
  model: ModelId                  // Per-agent model selection
  messages: Message[]
  queuedMessages: QueuedMessage[] // Messages sent while AI is responding
  conversationId: string | null   // For save/load functionality
  createdAt: Date
  error?: string                  // Error message if status is 'error'
}

// Maximum number of concurrent agents
export const MAX_AGENTS = 5

// Loaded conversation data for creating agent with history
interface LoadedConversation {
  conversationId: string
  title: string
  model: ModelId
  messages: Message[]
}

// Agent store interface
interface AgentStore {
  // State
  agents: Agent[]
  activeAgentId: string | null

  // Agent lifecycle
  createAgent: () => string | null        // Returns agent ID or null if at max
  createAgentWithConversation: (conversation: LoadedConversation) => string | null  // Create agent with loaded history
  removeAgent: (id: string) => void

  // Agent selection
  setActiveAgent: (id: string) => void
  getAgent: (id: string) => Agent | undefined
  getActiveAgent: () => Agent | undefined

  // Agent updates
  updateAgentName: (id: string, name: string) => void
  updateAgentStatus: (id: string, status: AgentStatus, error?: string) => void
  updateAgentModel: (id: string, model: ModelId) => void
  setAgentConversationId: (id: string, conversationId: string | null) => void

  // Message management
  addMessage: (agentId: string, message: Message) => void
  insertMessageBefore: (agentId: string, message: Message, beforeMessageId: string) => void
  updateMessage: (agentId: string, messageId: string, updates: Partial<Message>) => void
  setMessages: (agentId: string, messages: Message[]) => void
  clearMessages: (agentId: string) => void
  toggleMessageBookmark: (agentId: string, messageId: string) => void

  // Queued message management (messages sent while AI is responding)
  addQueuedMessage: (agentId: string, content: string) => string  // Returns message ID
  getQueuedMessages: (agentId: string) => QueuedMessage[]
  clearQueuedMessages: (agentId: string) => QueuedMessage[]  // Returns cleared messages for processing

  // Utility
  canCreateAgent: () => boolean
  getAgentCount: () => number
  findAgentByConversationId: (conversationId: string) => Agent | undefined

  // Reset (for fresh sessions)
  resetAllAgents: () => void
}

// Generate unique agent ID
function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Create default agent
function createDefaultAgent(): Agent {
  return {
    id: generateAgentId(),
    name: 'New Chat',
    status: 'idle',
    model: DEFAULT_MODEL,
    messages: [],
    queuedMessages: [],
    conversationId: null,
    createdAt: new Date(),
  }
}

export const useAgentStore = create<AgentStore>((set, get) => {
  // Initialize with one default agent
  const initialAgent = createDefaultAgent()

  return {
    // Initial state
    agents: [initialAgent],
    activeAgentId: initialAgent.id,

    // Create a new agent
    createAgent: () => {
      const { agents } = get()
      if (agents.length >= MAX_AGENTS) {
        return null
      }

      const newAgent = createDefaultAgent()
      set({
        agents: [...agents, newAgent],
        activeAgentId: newAgent.id,
      })
      return newAgent.id
    },

    // Create an agent with a loaded conversation
    createAgentWithConversation: (conversation) => {
      const { agents } = get()
      if (agents.length >= MAX_AGENTS) {
        return null
      }

      const newAgent: Agent = {
        id: generateAgentId(),
        name: conversation.title,
        status: 'idle',
        model: conversation.model,
        messages: conversation.messages,
        queuedMessages: [],
        conversationId: conversation.conversationId,
        createdAt: new Date(),
      }

      set({
        agents: [...agents, newAgent],
        activeAgentId: newAgent.id,
      })
      return newAgent.id
    },

    // Remove an agent
    removeAgent: (id) => {
      const { agents, activeAgentId } = get()

      // Don't allow removing the last agent
      if (agents.length <= 1) {
        return
      }

      const newAgents = agents.filter(a => a.id !== id)

      // If removing the active agent, switch to another
      let newActiveId = activeAgentId
      if (activeAgentId === id) {
        // Find the next agent (prefer the one before, then after)
        const removedIndex = agents.findIndex(a => a.id === id)
        if (removedIndex > 0) {
          newActiveId = newAgents[removedIndex - 1].id
        } else if (newAgents.length > 0) {
          newActiveId = newAgents[0].id
        }
      }

      set({
        agents: newAgents,
        activeAgentId: newActiveId,
      })
    },

    // Set active agent
    setActiveAgent: (id) => {
      const { agents } = get()
      if (agents.some(a => a.id === id)) {
        set({ activeAgentId: id })
      }
    },

    // Get agent by ID
    getAgent: (id) => {
      return get().agents.find(a => a.id === id)
    },

    // Get active agent
    getActiveAgent: () => {
      const { agents, activeAgentId } = get()
      return agents.find(a => a.id === activeAgentId)
    },

    // Update agent name
    updateAgentName: (id, name) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id ? { ...a, name } : a
        ),
      }))
    },

    // Update agent status
    updateAgentStatus: (id, status, error) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id ? { ...a, status, error: error || undefined } : a
        ),
      }))
    },

    // Update agent model
    updateAgentModel: (id, model) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id ? { ...a, model } : a
        ),
      }))
    },

    // Set conversation ID
    setAgentConversationId: (id, conversationId) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === id ? { ...a, conversationId } : a
        ),
      }))
    },

    // Add message to agent
    addMessage: (agentId, message) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? { ...a, messages: [...a.messages, message] }
            : a
        ),
      }))
    },

    // Insert message before a specific message (used for tool messages before assistant)
    insertMessageBefore: (agentId, message, beforeMessageId) => {
      set(state => ({
        agents: state.agents.map(a => {
          if (a.id !== agentId) return a
          const index = a.messages.findIndex(m => m.id === beforeMessageId)
          if (index === -1) {
            // If target not found, append to end
            return { ...a, messages: [...a.messages, message] }
          }
          const newMessages = [...a.messages]
          newMessages.splice(index, 0, message)
          return { ...a, messages: newMessages }
        }),
      }))
    },

    // Update a specific message
    updateMessage: (agentId, messageId, updates) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? {
                ...a,
                messages: a.messages.map(m =>
                  m.id === messageId ? { ...m, ...updates } : m
                ),
              }
            : a
        ),
      }))
    },

    // Set all messages for an agent (used when loading conversations)
    setMessages: (agentId, messages) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId ? { ...a, messages } : a
        ),
      }))
    },

    // Clear all messages for an agent
    clearMessages: (agentId) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? { ...a, messages: [], conversationId: null }
            : a
        ),
      }))
    },

    // Toggle message bookmark
    toggleMessageBookmark: (agentId, messageId) => {
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? {
                ...a,
                messages: a.messages.map(m =>
                  m.id === messageId ? { ...m, bookmarked: !m.bookmarked } : m
                ),
              }
            : a
        ),
      }))
    },

    // Add a queued message (sent while AI is responding)
    addQueuedMessage: (agentId, content) => {
      const messageId = `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? {
                ...a,
                queuedMessages: [
                  ...a.queuedMessages,
                  { id: messageId, content, timestamp: new Date() }
                ]
              }
            : a
        ),
      }))
      return messageId
    },

    // Get queued messages for an agent
    getQueuedMessages: (agentId) => {
      const agent = get().agents.find(a => a.id === agentId)
      return agent?.queuedMessages || []
    },

    // Clear and return queued messages for processing
    clearQueuedMessages: (agentId) => {
      const agent = get().agents.find(a => a.id === agentId)
      const queuedMessages = agent?.queuedMessages || []
      set(state => ({
        agents: state.agents.map(a =>
          a.id === agentId
            ? { ...a, queuedMessages: [] }
            : a
        ),
      }))
      return queuedMessages
    },

    // Check if can create more agents
    canCreateAgent: () => {
      return get().agents.length < MAX_AGENTS
    },

    // Get current agent count
    getAgentCount: () => {
      return get().agents.length
    },

    // Find agent by conversation ID (to avoid loading duplicates)
    findAgentByConversationId: (conversationId) => {
      return get().agents.find(a => a.conversationId === conversationId)
    },

    // Reset all agents (for fresh session)
    resetAllAgents: () => {
      const newAgent = createDefaultAgent()
      set({
        agents: [newAgent],
        activeAgentId: newAgent.id,
      })
    },
  }
})
