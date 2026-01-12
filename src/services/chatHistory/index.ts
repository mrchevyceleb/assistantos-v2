/**
 * Chat History Service
 * Exports all chat history functionality
 */

export {
  // Types
  type ChatMessage,
  type AutosaveOptions,

  // Core functions
  saveConversationImmediate,
  saveConversationDebounced,
  cancelDebouncedSave,
  loadConversation,
  listConversations,
  deleteConversation,

  // Agent conversation mapping
  getOrCreateConversationId,
  setAgentConversationId,
  clearAgentConversationId,

  // Conversion utilities
  conversationToMessages,

  // Display utilities
  formatHistoryDate,
  groupConversationsByDate,
} from './chatHistoryService'
