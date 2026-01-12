/**
 * Memory Service Index
 *
 * Export all memory-related functionality from a single entry point.
 */

// Types
export type {
  MemoryUser,
  UserProfile,
  UserFact,
  UserPreference,
  ConversationSummary,
  MemoryConfig,
  MemoryStatus,
} from './types'

// Extraction
export {
  extractFactsFromMessage,
  extractPreferencesFromMessage,
  generateConversationSummary,
  processConversationForMemory,
} from './extractionService'

// Retrieval
export {
  getRelevantMemories,
  isTrivialMessage,
  extractQueryKeywords,
  estimateTokens,
  DEFAULT_TOKEN_BUDGET,
  type TokenBudget,
} from './retrievalService'

// Supabase client (if needed for direct access)
export {
  getSupabaseClient,
  testConnection,
  generateAnonymousId,
} from './supabaseClient'
