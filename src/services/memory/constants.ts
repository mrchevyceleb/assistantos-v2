/**
 * Memory System Constants
 *
 * Supabase credentials are loaded from environment variables via Electron IPC.
 * Create a .env file in the project root with MEMORY_SUPABASE_URL and MEMORY_SUPABASE_ANON_KEY.
 */

// Cached credentials loaded from environment variables
let cachedUrl: string | null = null
let cachedKey: string | null = null

/**
 * Get Supabase URL from environment variables
 */
export async function getMemorySupabaseUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl

  try {
    const url = await window.electronAPI.app.getEnv('MEMORY_SUPABASE_URL')
    cachedUrl = url || ''
    return cachedUrl
  } catch {
    return ''
  }
}

/**
 * Get Supabase anonymous key from environment variables
 */
export async function getMemorySupabaseKey(): Promise<string> {
  if (cachedKey) return cachedKey

  try {
    const key = await window.electronAPI.app.getEnv('MEMORY_SUPABASE_ANON_KEY')
    cachedKey = key || ''
    return cachedKey
  } catch {
    return ''
  }
}

/**
 * Check if Supabase credentials are configured
 */
export async function isMemoryConfigured(): Promise<boolean> {
  const url = await getMemorySupabaseUrl()
  const key = await getMemorySupabaseKey()
  return Boolean(url && key)
}
