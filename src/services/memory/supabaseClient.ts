/**
 * Supabase Client for Memory System
 *
 * Manages the connection to Supabase for persistent memory storage.
 * Uses anonymous UUID for cross-device user identification.
 * All users share the same Supabase backend.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getMemorySupabaseUrl, getMemorySupabaseKey, isMemoryConfigured } from './constants'

let supabaseClient: SupabaseClient | null = null

/**
 * Initialize or get the Supabase client
 * Throws error if credentials are not configured
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (supabaseClient) {
    return supabaseClient
  }

  if (!(await isMemoryConfigured())) {
    throw new Error(
      'Memory system not configured. Please set MEMORY_SUPABASE_URL and MEMORY_SUPABASE_ANON_KEY in your .env file'
    )
  }

  const url = await getMemorySupabaseUrl()
  const key = await getMemorySupabaseKey()

  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: false, // We don't use auth sessions
      autoRefreshToken: false,
    },
  })

  return supabaseClient
}

/**
 * Check if we have a valid Supabase connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await getSupabaseClient()
    // Try a simple query to test connection
    const { error } = await client.from('memory_users').select('id').limit(1)
    return !error
  } catch {
    return false
  }
}

/**
 * Clear the current client (useful when changing credentials)
 */
export function clearSupabaseClient(): void {
  supabaseClient = null
}

/**
 * Generate a new anonymous UUID for user identification
 */
export function generateAnonymousId(): string {
  return crypto.randomUUID()
}

/**
 * Database type definitions for Supabase
 */
export interface Database {
  public: {
    Tables: {
      memory_users: {
        Row: {
          id: string
          anonymous_id: string
          created_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          anonymous_id: string
          created_at?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          anonymous_id?: string
          created_at?: string
          last_seen_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          user_id: string
          name: string | null
          role: string | null
          company: string | null
          location: string | null
          timezone: string | null
          communication_style: string | null
          tech_stack: string[]
          key_projects: string[]
          profile_summary: string | null
          summary_updated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          role?: string | null
          company?: string | null
          location?: string | null
          timezone?: string | null
          communication_style?: string | null
          tech_stack?: string[]
          key_projects?: string[]
          profile_summary?: string | null
          summary_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string | null
          role?: string | null
          company?: string | null
          location?: string | null
          timezone?: string | null
          communication_style?: string | null
          tech_stack?: string[]
          key_projects?: string[]
          profile_summary?: string | null
          summary_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_facts: {
        Row: {
          id: string
          user_id: string
          category: string
          fact: string
          source: string
          confidence: number
          embedding: number[] | null
          keywords: string[]
          extracted_from_conversation: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category: string
          fact: string
          source?: string
          confidence?: number
          embedding?: number[] | null
          keywords?: string[]
          extracted_from_conversation?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          fact?: string
          source?: string
          confidence?: number
          embedding?: number[] | null
          keywords?: string[]
          extracted_from_conversation?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          domain: string
          preference_key: string
          preference_value: unknown
          observation_count: number
          confidence: number
          first_observed_at: string
          last_observed_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          domain: string
          preference_key: string
          preference_value: unknown
          observation_count?: number
          confidence?: number
          first_observed_at?: string
          last_observed_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          domain?: string
          preference_key?: string
          preference_value?: unknown
          observation_count?: number
          confidence?: number
          first_observed_at?: string
          last_observed_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      conversation_summaries: {
        Row: {
          id: string
          user_id: string
          local_conversation_id: string
          workspace_path: string | null
          title: string
          summary: string
          key_decisions: string[]
          outcomes: string[]
          problems_solved: string[]
          embedding: number[] | null
          keywords: string[]
          message_count: number | null
          model_used: string | null
          started_at: string | null
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          local_conversation_id: string
          workspace_path?: string | null
          title: string
          summary: string
          key_decisions?: string[]
          outcomes?: string[]
          problems_solved?: string[]
          embedding?: number[] | null
          keywords?: string[]
          message_count?: number | null
          model_used?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          local_conversation_id?: string
          workspace_path?: string | null
          title?: string
          summary?: string
          key_decisions?: string[]
          outcomes?: string[]
          problems_solved?: string[]
          embedding?: number[] | null
          keywords?: string[]
          message_count?: number | null
          model_used?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
      }
    }
    Functions: {
      get_or_create_memory_user: {
        Args: { p_anonymous_id: string }
        Returns: string
      }
      search_facts_by_embedding: {
        Args: {
          p_user_id: string
          p_query_embedding: number[]
          p_limit?: number
          p_min_similarity?: number
        }
        Returns: Array<{
          id: string
          category: string
          fact: string
          confidence: number
          similarity: number
        }>
      }
      search_summaries_by_embedding: {
        Args: {
          p_user_id: string
          p_query_embedding: number[]
          p_limit?: number
          p_min_similarity?: number
        }
        Returns: Array<{
          id: string
          title: string
          summary: string
          workspace_path: string | null
          similarity: number
        }>
      }
    }
  }
}
