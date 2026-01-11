/**
 * Memory System Types
 *
 * Type definitions for the persistent memory system that syncs across devices.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Memory user identity (anonymous UUID-based)
 */
export interface MemoryUser {
  id: string
  anonymousId: string
  createdAt: string
  lastSeenAt: string
}

/**
 * Core user profile - always included in context (~400 tokens)
 */
export interface UserProfile {
  id: string
  userId: string
  name?: string
  role?: string
  company?: string
  location?: string
  timezone?: string
  communicationStyle?: 'direct' | 'detailed' | 'casual'
  techStack: string[]
  keyProjects: string[]
  profileSummary?: string
  summaryUpdatedAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * Category for user facts
 */
export type FactCategory = 'personal' | 'work' | 'project' | 'preference'

/**
 * Source of fact extraction
 */
export type FactSource = 'explicit' | 'inferred'

/**
 * User fact - explicit statements about the user
 */
export interface UserFact {
  id: string
  userId: string
  category: FactCategory
  fact: string
  source: FactSource
  confidence: number
  keywords: string[]
  extractedFromConversation?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Input for creating a new fact
 */
export interface NewUserFact {
  category: FactCategory
  fact: string
  source?: FactSource
  confidence?: number
  keywords?: string[]
  extractedFromConversation?: string
}

/**
 * Domain for user preferences
 */
export type PreferenceDomain = 'coding' | 'writing' | 'communication' | 'tools' | 'ui'

/**
 * User preference - learned patterns
 */
export interface UserPreference {
  id: string
  userId: string
  domain: PreferenceDomain
  preferenceKey: string
  preferenceValue: unknown
  observationCount: number
  confidence: number
  firstObservedAt: string
  lastObservedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * Input for creating/updating a preference
 */
export interface NewUserPreference {
  domain: PreferenceDomain
  preferenceKey: string
  preferenceValue: unknown
}

/**
 * Conversation summary - context from past conversations
 */
export interface ConversationSummary {
  id: string
  userId: string
  localConversationId: string
  workspacePath?: string
  title: string
  summary: string
  keyDecisions: string[]
  outcomes: string[]
  problemsSolved: string[]
  keywords: string[]
  messageCount?: number
  modelUsed?: string
  startedAt?: string
  endedAt?: string
  createdAt: string
}

/**
 * Input for creating a conversation summary
 */
export interface NewConversationSummary {
  localConversationId: string
  workspacePath?: string
  title: string
  summary: string
  keyDecisions?: string[]
  outcomes?: string[]
  problemsSolved?: string[]
  keywords?: string[]
  messageCount?: number
  modelUsed?: string
  startedAt?: string
  endedAt?: string
}

// ============================================================================
// Memory Context Types (for system prompt injection)
// ============================================================================

/**
 * Scored fact with relevance score for retrieval
 */
export interface ScoredFact extends UserFact {
  relevanceScore: number
}

/**
 * Scored summary with relevance score for retrieval
 */
export interface ScoredSummary extends ConversationSummary {
  relevanceScore: number
}

/**
 * Complete memory context for system prompt injection
 */
export interface MemoryContext {
  profile: UserProfile | null
  relevantFacts: ScoredFact[]
  activePreferences: UserPreference[]
  relatedSummaries: ScoredSummary[]
  tokenEstimate: number
}

/**
 * Token budget configuration
 */
export interface TokenBudget {
  coreProfile: number     // ~400 tokens
  relevantFacts: number   // ~300 tokens
  preferences: number     // ~100 tokens
  summaries: number       // ~200 tokens
  total: number           // ~1000 tokens max
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  coreProfile: 400,
  relevantFacts: 300,
  preferences: 100,
  summaries: 200,
  total: 1000
}

// ============================================================================
// Extraction Types
// ============================================================================

/**
 * Extracted fact from conversation
 */
export interface ExtractedFact {
  category: FactCategory
  fact: string
  confidence: number
}

/**
 * Extraction result from AI analysis
 */
export interface ExtractionResult {
  facts: ExtractedFact[]
  summary?: {
    title: string
    summary: string
    keyDecisions: string[]
    outcomes: string[]
    problemsSolved: string[]
  }
}

/**
 * Pattern for rule-based fact extraction
 */
export interface FactPattern {
  pattern: RegExp
  category: FactCategory
  template: string
  confidence: number
}

// ============================================================================
// Service Types
// ============================================================================

/**
 * Memory service configuration
 */
export interface MemoryConfig {
  enabled: boolean
  supabaseUrl: string
  supabaseAnonKey: string
  userId: string | null  // Anonymous UUID
  embeddingApiKey?: string  // Optional OpenAI key for embeddings
}

/**
 * Memory service status
 */
export interface MemoryStatus {
  connected: boolean
  userId: string | null
  factCount: number
  preferenceCount: number
  summaryCount: number
  lastSyncAt: string | null
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean
  error?: string
  syncedAt: string
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface MemoryApiResponse<T> {
  data: T | null
  error: string | null
}

/**
 * Batch operation result
 */
export interface BatchResult {
  succeeded: number
  failed: number
  errors: string[]
}
