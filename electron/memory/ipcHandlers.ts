/**
 * Memory IPC Handlers
 *
 * Bridges the renderer process to the memory service running in the main process.
 */

import { ipcMain } from 'electron'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  initializeEmbeddings,
  isEmbeddingsAvailable,
  generateEmbedding,
  generateEmbeddings,
  formatEmbeddingForSupabase,
} from './embeddingService'

// In-memory state for the memory service
let supabaseClient: SupabaseClient | null = null
let currentConfig: { url: string; anonKey: string } | null = null
let internalUserId: string | null = null

/**
 * Get or create Supabase client
 */
function getClient(url: string, anonKey: string): SupabaseClient {
  if (supabaseClient && currentConfig?.url === url && currentConfig?.anonKey === anonKey) {
    return supabaseClient
  }
  supabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  currentConfig = { url, anonKey }
  return supabaseClient
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
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
    .slice(0, 20)
}

/**
 * Register all memory IPC handlers
 */
export function registerMemoryHandlers(): void {
  // Initialize/connect to Supabase
  ipcMain.handle(
    'memory:initialize',
    async (_event, url: string, anonKey: string, anonymousId: string) => {
      try {
        const client = getClient(url, anonKey)

        // Test connection
        const { error: testError } = await client.from('memory_users').select('id').limit(1)
        if (testError) {
          return { success: false, error: testError.message }
        }

        // Get or create user
        const { data, error } = await client.rpc('get_or_create_memory_user', {
          p_anonymous_id: anonymousId,
        })

        if (error) {
          return { success: false, error: error.message }
        }

        internalUserId = data as string
        return { success: true, userId: internalUserId }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Get status
  ipcMain.handle('memory:getStatus', async () => {
    if (!supabaseClient || !internalUserId) {
      return {
        connected: false,
        factCount: 0,
        preferenceCount: 0,
        summaryCount: 0,
      }
    }

    const [factsResult, prefsResult, summariesResult] = await Promise.all([
      supabaseClient
        .from('user_facts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', internalUserId)
        .eq('is_active', true),
      supabaseClient
        .from('user_preferences')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', internalUserId),
      supabaseClient
        .from('conversation_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', internalUserId),
    ])

    return {
      connected: true,
      factCount: factsResult.count || 0,
      preferenceCount: prefsResult.count || 0,
      summaryCount: summariesResult.count || 0,
      embeddingsEnabled: isEmbeddingsAvailable(),
    }
  })

  // Set OpenAI API key for embeddings
  ipcMain.handle('memory:setOpenaiKey', async (_event, apiKey: string) => {
    initializeEmbeddings(apiKey)
    return { success: true, embeddingsEnabled: isEmbeddingsAvailable() }
  })

  // Check if embeddings are available
  ipcMain.handle('memory:isEmbeddingsEnabled', async () => {
    return isEmbeddingsAvailable()
  })

  // ============================================================================
  // Profile Operations
  // ============================================================================

  ipcMain.handle('memory:getProfile', async () => {
    if (!supabaseClient || !internalUserId) return null

    const { data } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('user_id', internalUserId)
      .single()

    return data
  })

  ipcMain.handle('memory:updateProfile', async (_event, updates: Record<string, unknown>) => {
    if (!supabaseClient || !internalUserId) return null

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.role !== undefined) dbUpdates.role = updates.role
    if (updates.company !== undefined) dbUpdates.company = updates.company
    if (updates.location !== undefined) dbUpdates.location = updates.location
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone
    if (updates.communication_style !== undefined)
      dbUpdates.communication_style = updates.communication_style
    if (updates.tech_stack !== undefined) dbUpdates.tech_stack = updates.tech_stack
    if (updates.key_projects !== undefined) dbUpdates.key_projects = updates.key_projects
    if (updates.profile_summary !== undefined) {
      dbUpdates.profile_summary = updates.profile_summary
      dbUpdates.summary_updated_at = new Date().toISOString()
    }

    const { data } = await supabaseClient
      .from('user_profiles')
      .update(dbUpdates)
      .eq('user_id', internalUserId)
      .select()
      .single()

    return data
  })

  // ============================================================================
  // Facts Operations
  // ============================================================================

  ipcMain.handle('memory:getFacts', async (_event, category?: string) => {
    if (!supabaseClient || !internalUserId) return []

    let query = supabaseClient
      .from('user_facts')
      .select('*')
      .eq('user_id', internalUserId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    const { data } = await query
    return data || []
  })

  ipcMain.handle(
    'memory:addFact',
    async (
      _event,
      fact: { category: string; fact: string; source?: string; confidence?: number; conversationId?: string }
    ) => {
      if (!supabaseClient || !internalUserId) return null

      // Generate embedding if available
      const embedding = await generateEmbedding(fact.fact)

      const insertData: Record<string, unknown> = {
        user_id: internalUserId,
        category: fact.category,
        fact: fact.fact,
        source: fact.source || 'explicit',
        confidence: fact.confidence ?? 1.0,
        keywords: extractKeywords(fact.fact),
        extracted_from_conversation: fact.conversationId,
      }

      // Add embedding if generated successfully
      if (embedding) {
        insertData.embedding = formatEmbeddingForSupabase(embedding)
      }

      const { data } = await supabaseClient
        .from('user_facts')
        .insert(insertData)
        .select()
        .single()

      return data
    }
  )

  ipcMain.handle(
    'memory:addFacts',
    async (
      _event,
      facts: Array<{ category: string; fact: string; source?: string; confidence?: number; conversationId?: string }>
    ) => {
      if (!supabaseClient || !internalUserId || facts.length === 0) return []

      // Generate embeddings for all facts in batch (more efficient)
      const embeddings = await generateEmbeddings(facts.map((f) => f.fact))

      const inserts = facts.map((f, i) => {
        const insert: Record<string, unknown> = {
          user_id: internalUserId!,
          category: f.category,
          fact: f.fact,
          source: f.source || 'explicit',
          confidence: f.confidence ?? 1.0,
          keywords: extractKeywords(f.fact),
          extracted_from_conversation: f.conversationId,
        }

        // Add embedding if generated successfully
        if (embeddings[i]) {
          insert.embedding = formatEmbeddingForSupabase(embeddings[i]!)
        }

        return insert
      })

      const { data } = await supabaseClient.from('user_facts').insert(inserts).select()
      return data || []
    }
  )

  ipcMain.handle('memory:deleteFact', async (_event, factId: string) => {
    if (!supabaseClient || !internalUserId) return false

    const { error } = await supabaseClient
      .from('user_facts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', factId)
      .eq('user_id', internalUserId)

    return !error
  })

  ipcMain.handle('memory:searchFacts', async (_event, query: string, limit: number = 5) => {
    if (!supabaseClient || !internalUserId) return []

    const keywords = extractKeywords(query)
    if (keywords.length === 0) return []

    const { data } = await supabaseClient
      .from('user_facts')
      .select('*')
      .eq('user_id', internalUserId)
      .eq('is_active', true)
      .overlaps('keywords', keywords)
      .limit(limit)

    return data || []
  })

  // ============================================================================
  // Preferences Operations
  // ============================================================================

  ipcMain.handle('memory:getPreferences', async (_event, domain?: string) => {
    if (!supabaseClient || !internalUserId) return []

    let query = supabaseClient
      .from('user_preferences')
      .select('*')
      .eq('user_id', internalUserId)
      .order('confidence', { ascending: false })

    if (domain) {
      query = query.eq('domain', domain)
    }

    const { data } = await query
    return data || []
  })

  ipcMain.handle(
    'memory:upsertPreference',
    async (_event, pref: { domain: string; preference_key: string; preference_value: unknown }) => {
      if (!supabaseClient || !internalUserId) return null

      // Check if exists
      const { data: existing } = await supabaseClient
        .from('user_preferences')
        .select('*')
        .eq('user_id', internalUserId)
        .eq('domain', pref.domain)
        .eq('preference_key', pref.preference_key)
        .single()

      if (existing) {
        const { data } = await supabaseClient
          .from('user_preferences')
          .update({
            preference_value: pref.preference_value,
            observation_count: existing.observation_count + 1,
            confidence: Math.min(1.0, existing.confidence + 0.1),
            last_observed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()
        return data
      } else {
        const { data } = await supabaseClient
          .from('user_preferences')
          .insert({
            user_id: internalUserId,
            domain: pref.domain,
            preference_key: pref.preference_key,
            preference_value: pref.preference_value,
          })
          .select()
          .single()
        return data
      }
    }
  )

  ipcMain.handle('memory:deletePreference', async (_event, preferenceId: string) => {
    if (!supabaseClient || !internalUserId) return false

    const { error } = await supabaseClient
      .from('user_preferences')
      .delete()
      .eq('id', preferenceId)
      .eq('user_id', internalUserId)

    return !error
  })

  // ============================================================================
  // Conversation Summaries
  // ============================================================================

  ipcMain.handle('memory:getSummaries', async (_event, workspacePath?: string) => {
    if (!supabaseClient || !internalUserId) return []

    let query = supabaseClient
      .from('conversation_summaries')
      .select('*')
      .eq('user_id', internalUserId)
      .order('created_at', { ascending: false })

    if (workspacePath) {
      query = query.eq('workspace_path', workspacePath)
    }

    const { data } = await query
    return data || []
  })

  ipcMain.handle(
    'memory:addSummary',
    async (
      _event,
      summary: {
        local_conversation_id: string
        workspace_path?: string
        title: string
        summary: string
        key_decisions?: string[]
        outcomes?: string[]
        problems_solved?: string[]
        message_count?: number
        model_used?: string
        started_at?: string
        ended_at?: string
      }
    ) => {
      if (!supabaseClient || !internalUserId) return null

      // Generate embedding for the summary text
      const embedding = await generateEmbedding(summary.summary)

      const insertData: Record<string, unknown> = {
        user_id: internalUserId,
        local_conversation_id: summary.local_conversation_id,
        workspace_path: summary.workspace_path,
        title: summary.title,
        summary: summary.summary,
        key_decisions: summary.key_decisions || [],
        outcomes: summary.outcomes || [],
        problems_solved: summary.problems_solved || [],
        keywords: extractKeywords(summary.summary),
        message_count: summary.message_count,
        model_used: summary.model_used,
        started_at: summary.started_at,
        ended_at: summary.ended_at,
      }

      // Add embedding if generated successfully
      if (embedding) {
        insertData.embedding = formatEmbeddingForSupabase(embedding)
      }

      const { data } = await supabaseClient
        .from('conversation_summaries')
        .insert(insertData)
        .select()
        .single()

      return data
    }
  )

  ipcMain.handle('memory:searchSummaries', async (_event, query: string, limit: number = 3) => {
    if (!supabaseClient || !internalUserId) return []

    const keywords = extractKeywords(query)
    if (keywords.length === 0) return []

    const { data } = await supabaseClient
      .from('conversation_summaries')
      .select('*')
      .eq('user_id', internalUserId)
      .overlaps('keywords', keywords)
      .limit(limit)

    return data || []
  })

  // ============================================================================
  // Combined Memory Context
  // ============================================================================

  ipcMain.handle('memory:getRelevantMemories', async (_event, query: string) => {
    if (!supabaseClient || !internalUserId) {
      return { profile: null, facts: [], preferences: [], summaries: [], usedEmbeddings: false }
    }

    const keywords = extractKeywords(query)

    // Try to generate embedding for semantic search
    const queryEmbedding = await generateEmbedding(query)
    const useSemanticSearch = queryEmbedding !== null

    // Fetch profile and preferences (no embedding search needed)
    const [profileResult, prefsResult] = await Promise.all([
      supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('user_id', internalUserId)
        .single(),
      supabaseClient
        .from('user_preferences')
        .select('*')
        .eq('user_id', internalUserId)
        .gte('confidence', 0.5)
        .limit(10),
    ])

    // Fetch facts and summaries with semantic or keyword search
    let factsResult: { data: unknown[] | null }
    let summariesResult: { data: unknown[] | null }

    if (useSemanticSearch) {
      // Use semantic search via RPC functions
      const [factsRpc, summariesRpc] = await Promise.all([
        supabaseClient.rpc('search_facts_by_embedding', {
          p_user_id: internalUserId,
          p_query_embedding: formatEmbeddingForSupabase(queryEmbedding),
          p_limit: 5,
          p_min_similarity: 0.3,
        }),
        supabaseClient.rpc('search_summaries_by_embedding', {
          p_user_id: internalUserId,
          p_query_embedding: formatEmbeddingForSupabase(queryEmbedding),
          p_limit: 2,
          p_min_similarity: 0.3,
        }),
      ])
      factsResult = factsRpc
      summariesResult = summariesRpc
    } else {
      // Fallback to keyword search
      const [factsKw, summariesKw] = await Promise.all([
        keywords.length > 0
          ? supabaseClient
              .from('user_facts')
              .select('*')
              .eq('user_id', internalUserId)
              .eq('is_active', true)
              .overlaps('keywords', keywords)
              .limit(5)
          : Promise.resolve({ data: [] }),
        keywords.length > 0
          ? supabaseClient
              .from('conversation_summaries')
              .select('*')
              .eq('user_id', internalUserId)
              .overlaps('keywords', keywords)
              .limit(2)
          : Promise.resolve({ data: [] }),
      ])
      factsResult = factsKw
      summariesResult = summariesKw
    }

    return {
      profile: profileResult.data,
      facts: factsResult.data || [],
      preferences: prefsResult.data || [],
      summaries: summariesResult.data || [],
      usedEmbeddings: useSemanticSearch,
    }
  })

  // Disconnect/cleanup
  ipcMain.handle('memory:disconnect', async () => {
    supabaseClient = null
    currentConfig = null
    internalUserId = null
    return { success: true }
  })
}

/**
 * Cleanup memory handlers (call on app quit)
 */
export function cleanupMemoryHandlers(): void {
  supabaseClient = null
  currentConfig = null
  internalUserId = null
}
