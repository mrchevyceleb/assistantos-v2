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

// Individual agent state
export interface Agent {
  id: string
  name: string                    // Auto-generated from first prompt
  status: AgentStatus
  model: ModelId                  // Per-agent model selection
  messages: Message[]
  conversationId: string | null   // For save/load functionality
  createdAt: Date
  error?: string                  // Error message if status is 'error'
}

// Maximum number of concurrent agents
export const MAX_AGENTS = 5

// Agent store interface
interface AgentStore {
  // State
  agents: Agent[]
  activeAgentId: string | null

  // Agent lifecycle
  createAgent: () => string | null        // Returns agent ID or null if at max
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
  updateMessage: (agentId: string, messageId: string, updates: Partial<Message>) => void
  setMessages: (agentId: string, messages: Message[]) => void
  clearMessages: (agentId: string) => void
  toggleMessageBookmark: (agentId: string, messageId: string) => void

  // Utility
  canCreateAgent: () => boolean
  getAgentCount: () => number

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

    // Check if can create more agents
    canCreateAgent: () => {
      return get().agents.length < MAX_AGENTS
    },

    // Get current agent count
    getAgentCount: () => {
      return get().agents.length
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
