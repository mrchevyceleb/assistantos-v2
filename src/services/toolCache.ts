/**
 * Tool Caching Service
 * Caches MCP tool schemas to avoid refetching on every message
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages'

interface ToolCache {
  tools: Tool[]
  hash: string
  timestamp: number
}

// Module-level cache
let cache: ToolCache | null = null

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

/**
 * Get cached MCP tools or fetch fresh if needed
 * @param enabledIds - Array of enabled integration IDs
 * @returns Combined array of MCP tools (without local tools - those are added separately)
 */
export async function getCachedMCPTools(enabledIds: string[]): Promise<Tool[]> {
  const hash = enabledIds.sort().join(',')

  // Return cached tools if valid (same integrations, not expired)
  if (cache && cache.hash === hash && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.tools
  }

  // Fetch fresh tools from MCP servers
  try {
    const mcpTools = await window.electronAPI.mcp?.getTools(enabledIds) ?? []
    const tools = mcpTools.map((t: any) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    })) as Tool[]

    // Update cache
    cache = {
      tools,
      hash,
      timestamp: Date.now()
    }

    return tools
  } catch (error) {
    console.error('[ToolCache] Failed to fetch MCP tools:', error)
    // Return stale cache if available, otherwise empty
    return cache?.tools ?? []
  }
}

/**
 * Invalidate the tool cache
 * Call this when integrations are enabled/disabled
 */
export function invalidateToolCache(): void {
  cache = null
}

/**
 * Get the current cache state (for debugging)
 */
export function getToolCacheStats(): { cached: boolean; toolCount: number; age: number } | null {
  if (!cache) return null
  return {
    cached: true,
    toolCount: cache.tools.length,
    age: Date.now() - cache.timestamp
  }
}
