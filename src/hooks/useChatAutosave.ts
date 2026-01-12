/**
 * useChatAutosave Hook
 * Provides automatic chat saving with debouncing
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  ChatMessage,
  AutosaveOptions,
  saveConversationDebounced,
  saveConversationImmediate,
  cancelDebouncedSave,
  getOrCreateConversationId,
  setAgentConversationId,
  clearAgentConversationId,
} from '@/services/chatHistory/chatHistoryService'

interface UseChatAutosaveOptions {
  /** Enable/disable autosave */
  enabled: boolean
  /** Agent ID for tracking conversations */
  agentId: string
  /** Agent display name */
  agentName: string
  /** Model being used */
  modelId: string
  /** Current workspace path */
  workspacePath: string | null
  /** Debounce delay in ms (default: 2000) */
  debounceDelay?: number
  /** Called when autosave completes */
  onSaveComplete?: (result: { success: boolean; conversationId?: string; error?: string }) => void
}

interface UseChatAutosaveReturn {
  /** Current conversation ID (may be null if no save has occurred yet) */
  conversationId: string | null
  /** Trigger an immediate save (bypasses debounce) */
  saveNow: () => Promise<{ success: boolean; conversationId?: string; error?: string }>
  /** Reset for a new conversation */
  resetConversation: () => void
  /** Load an existing conversation (sets the conversation ID) */
  setConversationId: (id: string | null) => void
}

/**
 * Hook that automatically saves chat messages with debouncing
 *
 * @example
 * ```tsx
 * const { conversationId, saveNow, resetConversation } = useChatAutosave({
 *   enabled: true,
 *   agentId: 'agent-123',
 *   agentName: 'My Chat',
 *   modelId: 'claude-sonnet-4',
 *   workspacePath: '/path/to/workspace',
 *   messages,
 * })
 * ```
 */
export function useChatAutosave(
  messages: ChatMessage[],
  options: UseChatAutosaveOptions
): UseChatAutosaveReturn {
  const {
    enabled,
    agentId,
    agentName,
    modelId,
    workspacePath,
    debounceDelay = 2000,
    onSaveComplete,
  } = options

  // Track the current conversation ID
  const conversationIdRef = useRef<string | null>(null)

  // Track previous message count to detect changes
  const prevMessageCountRef = useRef(0)

  // Create stable autosave options
  const autosaveOptionsRef = useRef<AutosaveOptions>({
    agentId,
    agentName,
    modelId,
    workspacePath,
    debounceDelay,
  })

  // Update options ref when they change
  useEffect(() => {
    autosaveOptionsRef.current = {
      agentId,
      agentName,
      modelId,
      workspacePath,
      debounceDelay,
    }
  }, [agentId, agentName, modelId, workspacePath, debounceDelay])

  // Initialize conversation ID if needed
  useEffect(() => {
    if (enabled && messages.length >= 2 && !conversationIdRef.current) {
      conversationIdRef.current = getOrCreateConversationId(agentId)
    }
  }, [enabled, messages.length, agentId])

  // Autosave effect - triggers debounced save when messages change
  useEffect(() => {
    if (!enabled) return

    // Only save if we have meaningful messages
    if (messages.length < 2) return

    // Only trigger save if message count increased (new message added)
    // This prevents saves during streaming when content is updating
    const hasNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (!hasNewMessage) return

    // Check if the last assistant message is complete (not empty)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'assistant' && !lastMessage.content.trim()) {
      // Still streaming, don't save yet
      return
    }

    // Trigger debounced save
    saveConversationDebounced(
      messages,
      autosaveOptionsRef.current,
      (result) => {
        if (result.success && result.conversationId) {
          conversationIdRef.current = result.conversationId
        }
        onSaveComplete?.(result)
      }
    )

    // Cleanup: cancel pending save on unmount or dependency change
    return () => {
      cancelDebouncedSave()
    }
  }, [messages, enabled, onSaveComplete])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelDebouncedSave()
    }
  }, [])

  // Manual save function
  const saveNow = useCallback(async () => {
    const result = await saveConversationImmediate(messages, autosaveOptionsRef.current)
    if (result.success && result.conversationId) {
      conversationIdRef.current = result.conversationId
    }
    onSaveComplete?.(result)
    return result
  }, [messages, onSaveComplete])

  // Reset for new conversation
  const resetConversation = useCallback(() => {
    cancelDebouncedSave()
    clearAgentConversationId(agentId)
    conversationIdRef.current = null
    prevMessageCountRef.current = 0
  }, [agentId])

  // Set conversation ID (for loading existing conversations)
  const setConversationId = useCallback((id: string | null) => {
    setAgentConversationId(agentId, id)
    conversationIdRef.current = id
  }, [agentId])

  return {
    conversationId: conversationIdRef.current,
    saveNow,
    resetConversation,
    setConversationId,
  }
}
