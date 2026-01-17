/**
 * Memory Service
 *
 * Main service for managing persistent user memory across sessions and devices.
 * Handles CRUD operations for profile, facts, preferences, and conversation summaries.
 */

import { getSupabaseClient, testConnection, generateAnonymousId } from './supabaseClient'
import type {
  MemoryConfig,
  MemoryStatus,
  UserProfile,
  UserFact,
  NewUserFact,
  UserPreference,
  NewUserPreference,
  ConversationSummary,
  NewConversationSummary,
  MemoryContext,
  ScoredFact,
  ScoredSummary,
} from './types'
import { SupabaseClient } from '@supabase/supabase-js'

// Use a more relaxed type to avoid strict table typing issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = SupabaseClient<any>

/**
 * Memory Service class for managing all memory operations
 */
export class MemoryService {
  private config: MemoryConfig
  private client: SupabaseClientType | null = null
  private internalUserId: string | null = null // Supabase user ID (not anonymous ID)

  constructor(config: MemoryConfig) {
    this.config = config
  }

  /**
   * Initialize the service and ensure user exists
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      return false
    }

    // Test connection (uses hardcoded credentials from constants)
    const connected = await testConnection()
    if (!connected) {
      console.error('Memory service: Failed to connect to Supabase')
      return false
    }

    this.client = await getSupabaseClient() as SupabaseClientType

    // Ensure we have an anonymous ID
    if (!this.config.userId) {
      this.config.userId = generateAnonymousId()
    }

    // Get or create user
    const { data, error } = await this.client.rpc('get_or_create_memory_user', {
      p_anonymous_id: this.config.userId,
    })

    if (error) {
      console.error('Memory service: Failed to get/create user:', error)
      return false
    }

    this.internalUserId = data as string
    return true
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config }
    // Reset client if URL or key changed
    if (config.supabaseUrl || config.supabaseAnonKey) {
      this.client = null
      this.internalUserId = null
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<MemoryStatus> {
    if (!this.client || !this.internalUserId) {
      return {
        connected: false,
        userId: this.config.userId,
        factCount: 0,
        preferenceCount: 0,
        summaryCount: 0,
        lastSyncAt: null,
      }
    }

    const [factsResult, prefsResult, summariesResult] = await Promise.all([
      this.client
        .from('user_facts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.internalUserId)
        .eq('is_active', true),
      this.client
        .from('user_preferences')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.internalUserId),
      this.client
        .from('conversation_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.internalUserId),
    ])

    return {
      connected: true,
      userId: this.config.userId,
      factCount: factsResult.count || 0,
      preferenceCount: prefsResult.count || 0,
      summaryCount: summariesResult.count || 0,
      lastSyncAt: new Date().toISOString(),
    }
  }

  // ============================================================================
  // Profile Operations
  // ============================================================================

  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfile | null> {
    if (!this.client || !this.internalUserId) return null

    const { data, error } = await this.client
      .from('user_profiles')
      .select('*')
      .eq('user_id', this.internalUserId)
      .single()

    if (error || !data) return null

    return this.mapProfile(data)
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.client || !this.internalUserId) return null

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.role !== undefined) dbUpdates.role = updates.role
    if (updates.company !== undefined) dbUpdates.company = updates.company
    if (updates.location !== undefined) dbUpdates.location = updates.location
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone
    if (updates.communicationStyle !== undefined)
      dbUpdates.communication_style = updates.communicationStyle
    if (updates.techStack !== undefined) dbUpdates.tech_stack = updates.techStack
    if (updates.keyProjects !== undefined) dbUpdates.key_projects = updates.keyProjects
    if (updates.profileSummary !== undefined) {
      dbUpdates.profile_summary = updates.profileSummary
      dbUpdates.summary_updated_at = new Date().toISOString()
    }

    const { data, error } = await this.client
      .from('user_profiles')
      .update(dbUpdates)
      .eq('user_id', this.internalUserId)
      .select()
      .single()

    if (error || !data) return null

    return this.mapProfile(data)
  }

  // ============================================================================
  // Facts Operations
  // ============================================================================

  /**
   * Get all facts for user
   */
  async getFacts(category?: string): Promise<UserFact[]> {
    if (!this.client || !this.internalUserId) return []

    let query = this.client
      .from('user_facts')
      .select('*')
      .eq('user_id', this.internalUserId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error || !data) return []

    return data.map(this.mapFact)
  }

  /**
   * Add a new fact
   */
  async addFact(fact: NewUserFact): Promise<UserFact | null> {
    if (!this.client || !this.internalUserId) return null

    const { data, error } = await this.client
      .from('user_facts')
      .insert({
        user_id: this.internalUserId,
        category: fact.category,
        fact: fact.fact,
        source: fact.source || 'explicit',
        confidence: fact.confidence ?? 1.0,
        keywords: fact.keywords || this.extractKeywords(fact.fact),
        extracted_from_conversation: fact.extractedFromConversation,
      })
      .select()
      .single()

    if (error || !data) return null

    return this.mapFact(data)
  }

  /**
   * Add multiple facts at once
   */
  async addFacts(facts: NewUserFact[]): Promise<UserFact[]> {
    if (!this.client || !this.internalUserId || facts.length === 0) return []

    const inserts = facts.map((fact) => ({
      user_id: this.internalUserId!,
      category: fact.category,
      fact: fact.fact,
      source: fact.source || 'explicit',
      confidence: fact.confidence ?? 1.0,
      keywords: fact.keywords || this.extractKeywords(fact.fact),
      extracted_from_conversation: fact.extractedFromConversation,
    }))

    const { data, error } = await this.client.from('user_facts').insert(inserts).select()

    if (error || !data) return []

    return data.map(this.mapFact)
  }

  /**
   * Delete a fact (soft delete)
   */
  async deleteFact(factId: string): Promise<boolean> {
    if (!this.client || !this.internalUserId) return false

    const { error } = await this.client
      .from('user_facts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', factId)
      .eq('user_id', this.internalUserId)

    return !error
  }

  /**
   * Search facts by keywords
   */
  async searchFacts(query: string, limit: number = 5): Promise<UserFact[]> {
    if (!this.client || !this.internalUserId) return []

    const keywords = this.extractKeywords(query)
    if (keywords.length === 0) return []

    // Use keyword overlap search (fallback when no embeddings)
    const { data, error } = await this.client
      .from('user_facts')
      .select('*')
      .eq('user_id', this.internalUserId)
      .eq('is_active', true)
      .overlaps('keywords', keywords)
      .limit(limit)

    if (error || !data) return []

    return data.map(this.mapFact)
  }

  // ============================================================================
  // Preferences Operations
  // ============================================================================

  /**
   * Get all preferences
   */
  async getPreferences(domain?: string): Promise<UserPreference[]> {
    if (!this.client || !this.internalUserId) return []

    let query = this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', this.internalUserId)
      .order('confidence', { ascending: false })

    if (domain) {
      query = query.eq('domain', domain)
    }

    const { data, error } = await query

    if (error || !data) return []

    return data.map(this.mapPreference)
  }

  /**
   * Update or create a preference
   */
  async upsertPreference(pref: NewUserPreference): Promise<UserPreference | null> {
    if (!this.client || !this.internalUserId) return null

    // Try to find existing
    const { data: existing } = await this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', this.internalUserId)
      .eq('domain', pref.domain)
      .eq('preference_key', pref.preferenceKey)
      .single()

    if (existing) {
      // Update existing
      const { data, error } = await this.client
        .from('user_preferences')
        .update({
          preference_value: pref.preferenceValue,
          observation_count: existing.observation_count + 1,
          confidence: Math.min(1.0, existing.confidence + 0.1),
          last_observed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error || !data) return null
      return this.mapPreference(data)
    } else {
      // Insert new
      const { data, error } = await this.client
        .from('user_preferences')
        .insert({
          user_id: this.internalUserId,
          domain: pref.domain,
          preference_key: pref.preferenceKey,
          preference_value: pref.preferenceValue,
        })
        .select()
        .single()

      if (error || !data) return null
      return this.mapPreference(data)
    }
  }

  /**
   * Delete a preference
   */
  async deletePreference(preferenceId: string): Promise<boolean> {
    if (!this.client || !this.internalUserId) return false

    const { error } = await this.client
      .from('user_preferences')
      .delete()
      .eq('id', preferenceId)
      .eq('user_id', this.internalUserId)

    return !error
  }

  // ============================================================================
  // Conversation Summary Operations
  // ============================================================================

  /**
   * Get all conversation summaries
   */
  async getSummaries(workspacePath?: string): Promise<ConversationSummary[]> {
    if (!this.client || !this.internalUserId) return []

    let query = this.client
      .from('conversation_summaries')
      .select('*')
      .eq('user_id', this.internalUserId)
      .order('created_at', { ascending: false })

    if (workspacePath) {
      query = query.eq('workspace_path', workspacePath)
    }

    const { data, error } = await query

    if (error || !data) return []

    return data.map(this.mapSummary)
  }

  /**
   * Add a conversation summary
   */
  async addSummary(summary: NewConversationSummary): Promise<ConversationSummary | null> {
    if (!this.client || !this.internalUserId) return null

    const { data, error } = await this.client
      .from('conversation_summaries')
      .insert({
        user_id: this.internalUserId,
        local_conversation_id: summary.localConversationId,
        workspace_path: summary.workspacePath,
        title: summary.title,
        summary: summary.summary,
        key_decisions: summary.keyDecisions || [],
        outcomes: summary.outcomes || [],
        problems_solved: summary.problemsSolved || [],
        keywords: summary.keywords || this.extractKeywords(summary.summary),
        message_count: summary.messageCount,
        model_used: summary.modelUsed,
        started_at: summary.startedAt,
        ended_at: summary.endedAt,
      })
      .select()
      .single()

    if (error || !data) return null

    return this.mapSummary(data)
  }

  /**
   * Search summaries by keywords
   */
  async searchSummaries(query: string, limit: number = 3): Promise<ConversationSummary[]> {
    if (!this.client || !this.internalUserId) return []

    const keywords = this.extractKeywords(query)
    if (keywords.length === 0) return []

    const { data, error } = await this.client
      .from('conversation_summaries')
      .select('*')
      .eq('user_id', this.internalUserId)
      .overlaps('keywords', keywords)
      .limit(limit)

    if (error || !data) return []

    return data.map(this.mapSummary)
  }

  // ============================================================================
  // Memory Context (for system prompt injection)
  // ============================================================================

  /**
   * Get relevant memories for a query
   */
  async getRelevantMemories(
    query: string,
    _workspacePath?: string
  ): Promise<MemoryContext> {
    const profile = await this.getProfile()
    const facts = await this.searchFacts(query, 5)
    const preferences = await this.getPreferences()
    const summaries = await this.searchSummaries(query, 2)

    // Score facts by keyword relevance
    const queryKeywords = this.extractKeywords(query)
    const scoredFacts: ScoredFact[] = facts.map((fact) => ({
      ...fact,
      relevanceScore: this.calculateKeywordOverlap(queryKeywords, fact.keywords),
    }))

    // Score summaries
    const scoredSummaries: ScoredSummary[] = summaries.map((summary) => ({
      ...summary,
      relevanceScore: this.calculateKeywordOverlap(queryKeywords, summary.keywords),
    }))

    // Filter to high-confidence preferences
    const activePreferences = preferences.filter((p) => p.confidence >= 0.5)

    // Estimate tokens
    const tokenEstimate = this.estimateTokens(profile, scoredFacts, activePreferences, scoredSummaries)

    return {
      profile,
      relevantFacts: scoredFacts.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5),
      activePreferences: activePreferences.slice(0, 10),
      relatedSummaries: scoredSummaries.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 2),
      tokenEstimate,
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction: lowercase, remove punctuation, split, filter common words
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'between',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
      'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
    ])

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 20) // Limit to 20 keywords
  }

  /**
   * Calculate overlap between keyword sets
   */
  private calculateKeywordOverlap(queryKeywords: string[], factKeywords: string[]): number {
    if (queryKeywords.length === 0 || factKeywords.length === 0) return 0
    const factSet = new Set(factKeywords)
    const matches = queryKeywords.filter((k) => factSet.has(k)).length
    return matches / Math.max(queryKeywords.length, factKeywords.length)
  }

  /**
   * Estimate token count for memory context
   */
  private estimateTokens(
    profile: UserProfile | null,
    facts: ScoredFact[],
    preferences: UserPreference[],
    summaries: ScoredSummary[]
  ): number {
    // Rough estimate: 1 token ~= 4 characters
    let chars = 0

    if (profile) {
      chars += (profile.name?.length || 0) + (profile.role?.length || 0)
      chars += (profile.company?.length || 0) + (profile.profileSummary?.length || 0)
      chars += profile.techStack.join(', ').length
      chars += profile.keyProjects.join(', ').length
      chars += 100 // Labels and formatting
    }

    for (const fact of facts) {
      chars += fact.fact.length + 20 // Include category label
    }

    for (const pref of preferences) {
      chars += pref.preferenceKey.length + JSON.stringify(pref.preferenceValue).length + 20
    }

    for (const summary of summaries) {
      chars += summary.title.length + summary.summary.length + 50
    }

    return Math.ceil(chars / 4)
  }

  // ============================================================================
  // Data Mappers
  // ============================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapProfile(row: any): UserProfile {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name || undefined,
      role: row.role || undefined,
      company: row.company || undefined,
      location: row.location || undefined,
      timezone: row.timezone || undefined,
      communicationStyle: row.communication_style as UserProfile['communicationStyle'],
      techStack: row.tech_stack || [],
      keyProjects: row.key_projects || [],
      profileSummary: row.profile_summary || undefined,
      summaryUpdatedAt: row.summary_updated_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapFact(row: any): UserFact {
    return {
      id: row.id,
      userId: row.user_id,
      category: row.category as UserFact['category'],
      fact: row.fact,
      source: row.source as UserFact['source'],
      confidence: row.confidence,
      keywords: row.keywords || [],
      extractedFromConversation: row.extracted_from_conversation || undefined,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapPreference(row: any): UserPreference {
    return {
      id: row.id,
      userId: row.user_id,
      domain: row.domain as UserPreference['domain'],
      preferenceKey: row.preference_key,
      preferenceValue: row.preference_value,
      observationCount: row.observation_count,
      confidence: row.confidence,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapSummary(row: any): ConversationSummary {
    return {
      id: row.id,
      userId: row.user_id,
      localConversationId: row.local_conversation_id,
      workspacePath: row.workspace_path || undefined,
      title: row.title,
      summary: row.summary,
      keyDecisions: row.key_decisions || [],
      outcomes: row.outcomes || [],
      problemsSolved: row.problems_solved || [],
      keywords: row.keywords || [],
      messageCount: row.message_count || undefined,
      modelUsed: row.model_used || undefined,
      startedAt: row.started_at || undefined,
      endedAt: row.ended_at || undefined,
      createdAt: row.created_at,
    }
  }
}

/**
 * Create a memory service instance
 */
export function createMemoryService(config: MemoryConfig): MemoryService {
  return new MemoryService(config)
}
