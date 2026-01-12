/**
 * Chat History Service
 * Handles autosave with debouncing and chat history management
 */

import { Conversation, ConversationMeta, ConversationMessage, generateConversationId, generateTitle } from '../conversationStorage'

// Debounce timer reference
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Default debounce delay in milliseconds (2 seconds)
const DEFAULT_DEBOUNCE_DELAY = 2000

// Minimum message count before autosave kicks in
const MIN_MESSAGES_FOR_AUTOSAVE = 2

// Internal state to track conversation IDs per agent
const agentConversationMap = new Map<string, string>()

/**
 * Message type matching AgentChat's internal Message interface
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
}

/**
 * Options for autosave functionality
 */
export interface AutosaveOptions {
  agentId: string
  agentName: string
  modelId: string
  workspacePath: string | null
  debounceDelay?: number
}

/**
 * Convert internal chat messages to conversation storage format
 */
function messagesToConversationFormat(messages: ChatMessage[]): ConversationMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    toolName: m.toolName,
    toolResult: m.toolResult,
    bookmarked: m.bookmarked,
  }))
}

/**
 * Convert conversation storage format back to chat messages
 */
export function conversationToMessages(conversation: Conversation): ChatMessage[] {
  return conversation.messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    toolName: m.toolName,
    toolResult: m.toolResult,
    bookmarked: m.bookmarked,
  }))
}

/**
 * Get or create a conversation ID for an agent
 */
export function getOrCreateConversationId(agentId: string): string {
  let convId = agentConversationMap.get(agentId)
  if (!convId) {
    convId = generateConversationId()
    agentConversationMap.set(agentId, convId)
  }
  return convId
}

/**
 * Set the conversation ID for an agent (e.g., when loading a conversation)
 */
export function setAgentConversationId(agentId: string, conversationId: string | null): void {
  if (conversationId) {
    agentConversationMap.set(agentId, conversationId)
  } else {
    agentConversationMap.delete(agentId)
  }
}

/**
 * Clear the conversation ID for an agent (e.g., when starting a new conversation)
 */
export function clearAgentConversationId(agentId: string): void {
  agentConversationMap.delete(agentId)
}

/**
 * Perform immediate save without debouncing
 * Returns the conversation ID on success
 */
export async function saveConversationImmediate(
  messages: ChatMessage[],
  options: AutosaveOptions
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  // Don't save empty conversations
  if (messages.length < MIN_MESSAGES_FOR_AUTOSAVE) {
    return { success: false, error: 'Not enough messages to save' }
  }

  // Filter out empty assistant messages (streaming placeholders)
  const validMessages = messages.filter(m =>
    m.role !== 'assistant' || m.content.trim() !== ''
  )

  if (validMessages.length < MIN_MESSAGES_FOR_AUTOSAVE) {
    return { success: false, error: 'Not enough valid messages to save' }
  }

  try {
    const convId = getOrCreateConversationId(options.agentId)
    const now = new Date().toISOString()

    // Try to get existing conversation to preserve createdAt
    let createdAt = now
    try {
      const existing = await window.electronAPI.conversation.load(convId)
      if (existing?.createdAt) {
        createdAt = existing.createdAt
      }
    } catch {
      // New conversation, use current timestamp
    }

    const conversationMessages = messagesToConversationFormat(validMessages)
    const conversationTitle = options.agentName !== 'New Chat'
      ? options.agentName
      : generateTitle(conversationMessages)

    const conversation: Conversation = {
      id: convId,
      title: conversationTitle,
      createdAt,
      updatedAt: now,
      model: options.modelId,
      messages: conversationMessages,
      bookmarks: validMessages.filter(m => m.bookmarked).map(m => m.id),
      workspace: options.workspacePath,
    }

    const result = await window.electronAPI.conversation.save(conversation)

    if (result.success) {
      return { success: true, conversationId: convId }
    } else {
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.error('[ChatHistory] Save failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Save conversation with debouncing
 * Multiple rapid calls will only result in one save after the delay
 */
export function saveConversationDebounced(
  messages: ChatMessage[],
  options: AutosaveOptions,
  onSaveComplete?: (result: { success: boolean; conversationId?: string; error?: string }) => void
): void {
  // Clear any existing timer
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer)
  }

  // Set new timer
  saveDebounceTimer = setTimeout(async () => {
    const result = await saveConversationImmediate(messages, options)
    onSaveComplete?.(result)
  }, options.debounceDelay ?? DEFAULT_DEBOUNCE_DELAY)
}

/**
 * Cancel any pending debounced save
 */
export function cancelDebouncedSave(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer)
    saveDebounceTimer = null
  }
}

/**
 * Load a conversation by ID
 */
export async function loadConversation(conversationId: string): Promise<Conversation | null> {
  try {
    return await window.electronAPI.conversation.load(conversationId)
  } catch (error) {
    console.error('[ChatHistory] Load failed:', error)
    return null
  }
}

/**
 * Get list of all saved conversations (metadata only)
 */
export async function listConversations(): Promise<ConversationMeta[]> {
  try {
    return await window.electronAPI.conversation.list()
  } catch (error) {
    console.error('[ChatHistory] List failed:', error)
    return []
  }
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const result = await window.electronAPI.conversation.delete(conversationId)
    return result.success
  } catch (error) {
    console.error('[ChatHistory] Delete failed:', error)
    return false
  }
}

/**
 * Format a date for display in the chat history list
 */
export function formatHistoryDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }
}

/**
 * Group conversations by date category
 */
export function groupConversationsByDate(conversations: ConversationMeta[]): Map<string, ConversationMeta[]> {
  const groups = new Map<string, ConversationMeta[]>()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt)
    let category: string

    if (date >= today) {
      category = 'Today'
    } else if (date >= yesterday) {
      category = 'Yesterday'
    } else if (date >= lastWeek) {
      category = 'Last 7 Days'
    } else if (date >= lastMonth) {
      category = 'Last 30 Days'
    } else {
      category = 'Older'
    }

    if (!groups.has(category)) {
      groups.set(category, [])
    }
    groups.get(category)!.push(conv)
  }

  return groups
}
