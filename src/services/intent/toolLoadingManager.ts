import type { Message } from '@/types/chat'
import type { Tool } from '@/types/tool'
import type { IntegrationConfig } from '@/types/integration'
import { detectIntent } from './heuristicMatcher'
import { aiClassifyIntent } from './aiFallback'
import { getCachedMCPTools } from '@/services/toolCache'
import { parseMessage } from '@/services/mentions/parser'

interface LoadedToolSet {
  integrationIds: string[]
  tools: Tool[]
  loadedAt: number
  lastUsed: number
  messagesSinceUse: Map<string, number> // Track per-integration
  pinnedIntegrations: Set<string> // Manually pinned integrations
}

interface ToolLoadingConfig {
  idleThreshold: number // Default: 5 messages
  cooldownPeriod: number // Default: 30000ms
  maxLoadedTools: number // Default: 3
  enableIntentDetection: boolean // Default: true
  enableAIFallback: boolean // Default: true
}

// Default configuration
const DEFAULT_CONFIG: ToolLoadingConfig = {
  idleThreshold: 5,
  cooldownPeriod: 30000,
  maxLoadedTools: 3,
  enableIntentDetection: true,
  enableAIFallback: true
}

// Per-agent tool tracking
const agentToolState = new Map<string, LoadedToolSet>()

// Cooldown timers per agent
const cooldownTimers = new Map<string, Map<string, NodeJS.Timeout>>()

/**
 * Gets the current configuration for tool loading
 * Can be extended to read from user settings
 */
function getConfig(): ToolLoadingConfig {
  // TODO: Read from appStore settings when Phase 6 is implemented
  return DEFAULT_CONFIG
}

/**
 * Gets tools for a message, managing the lifecycle of MCP tools
 * @param agentId - The agent ID
 * @param message - The user's message
 * @param conversationHistory - Recent conversation history
 * @param integrationConfigs - All integration configurations
 * @param apiKey - Anthropic API key for AI fallback
 * @param coreTools - Core tools (always included)
 * @returns Tools to use and list of loaded integration IDs
 */
export async function getToolsForMessage(
  agentId: string,
  message: string,
  conversationHistory: Message[],
  integrationConfigs: Record<string, IntegrationConfig>,
  apiKey: string,
  coreTools: Tool[]
): Promise<{ tools: Tool[]; loadedIntegrations: string[] }> {
  const config = getConfig()

  // Get list of enabled integrations
  const enabledIds = Object.entries(integrationConfigs)
    .filter(([_, config]) => config.enabled)
    .map(([id]) => id)

  // Always start with core tools
  const tools: Tool[] = [...coreTools]

  // Get current state
  let currentState = agentToolState.get(agentId)

  // Step 1: Determine which integrations to load
  const intentsToLoad: string[] = []

  // 1a. Check for @mentions (explicit, highest priority)
  const { mentions: mentionedIds } = await parseMessage(message, null)
  intentsToLoad.push(...mentionedIds)

  // 1b. If intent detection is enabled, use heuristics
  if (config.enableIntentDetection) {
    const heuristicMatches = detectIntent(message, conversationHistory, enabledIds)

    // Add high-confidence matches (>0.7)
    const highConfidence = heuristicMatches
      .filter(m => m.confidence > 0.7)
      .map(m => m.integrationId)
    intentsToLoad.push(...highConfidence)

    // For medium confidence (0.4-0.7), use AI fallback if enabled
    const mediumConfidence = heuristicMatches
      .filter(m => m.confidence >= 0.4 && m.confidence <= 0.7)

    if (mediumConfidence.length > 0 && config.enableAIFallback) {
      console.log('[Intent] Medium confidence matches, using AI fallback:', mediumConfidence.map(m => m.integrationId))
      try {
        const aiMatches = await aiClassifyIntent(message, apiKey, enabledIds)
        intentsToLoad.push(...aiMatches)
      } catch (error) {
        console.error('[Intent] AI fallback failed, skipping:', error)
      }
    } else if (mediumConfidence.length > 0) {
      console.log('[Intent] Medium confidence matches but AI fallback disabled:', mediumConfidence.map(m => m.integrationId))
    }
  }

  // Step 2: Add pinned integrations
  if (currentState) {
    intentsToLoad.push(...Array.from(currentState.pinnedIntegrations))
  }

  // Remove duplicates and ensure enabled
  const uniqueIntents = Array.from(new Set(intentsToLoad))
    .filter(id => enabledIds.includes(id))

  // Step 3: Enforce max loaded tools limit (LRU eviction)
  let finalIntents = uniqueIntents
  if (finalIntents.length > config.maxLoadedTools) {
    // Sort by last used (most recent first)
    finalIntents = finalIntents.slice(0, config.maxLoadedTools)
    console.log(`[Tool Manager] Enforcing max loaded tools (${config.maxLoadedTools}), keeping:`, finalIntents)
  }

  // Step 4: Load tools if needed
  if (finalIntents.length > 0) {
    // Check if we need to reload
    const currentIds = currentState?.integrationIds || []
    const needsReload =
      JSON.stringify(currentIds.sort()) !== JSON.stringify(finalIntents.sort())

    if (needsReload) {
      console.log(`[Tool Manager] Loading tools for agent ${agentId}:`, finalIntents)

      try {
        const mcpTools = await getCachedMCPTools(finalIntents)
        tools.push(...mcpTools)

        // Create new state
        const newState: LoadedToolSet = {
          integrationIds: finalIntents,
          tools: mcpTools,
          loadedAt: Date.now(),
          lastUsed: Date.now(),
          messagesSinceUse: new Map(finalIntents.map(id => [id, 0])),
          pinnedIntegrations: currentState?.pinnedIntegrations || new Set()
        }

        agentToolState.set(agentId, newState)

        // Cancel any cooldown timers for newly loaded tools
        const timers = cooldownTimers.get(agentId)
        if (timers) {
          for (const id of finalIntents) {
            const timer = timers.get(id)
            if (timer) {
              clearTimeout(timer)
              timers.delete(id)
            }
          }
        }
      } catch (error) {
        console.error('[Tool Manager] Failed to load MCP tools:', error)
      }
    } else if (currentState) {
      // Reuse loaded tools, reset idle counters for mentioned/detected ones
      tools.push(...currentState.tools)
      for (const id of finalIntents) {
        currentState.messagesSinceUse.set(id, 0)
      }
      currentState.lastUsed = Date.now()
      console.log(`[Tool Manager] Reusing loaded tools for agent ${agentId}:`, finalIntents)
    }
  }

  // Step 5: Increment idle counters for tools not in this message
  if (currentState) {
    for (const [id, count] of currentState.messagesSinceUse.entries()) {
      if (!finalIntents.includes(id) && !currentState.pinnedIntegrations.has(id)) {
        currentState.messagesSinceUse.set(id, count + 1)

        // Check if we should enter cooldown
        if (count + 1 >= config.idleThreshold) {
          console.log(`[Tool Manager] Integration ${id} reached idle threshold (${config.idleThreshold}), entering cooldown`)
          startCooldownTimer(agentId, id, config.cooldownPeriod)
        }
      }
    }
  }

  return {
    tools,
    loadedIntegrations: finalIntents
  }
}

/**
 * Marks a tool as used, resetting its idle counter
 */
export function markToolUsed(agentId: string, integrationId: string): void {
  const state = agentToolState.get(agentId)
  if (state) {
    state.lastUsed = Date.now()
    state.messagesSinceUse.set(integrationId, 0)

    // Cancel cooldown timer if active
    const timers = cooldownTimers.get(agentId)
    if (timers) {
      const timer = timers.get(integrationId)
      if (timer) {
        clearTimeout(timer)
        timers.delete(integrationId)
        console.log(`[Tool Manager] Tool ${integrationId} used, cooldown cancelled`)
      }
    }
  }
}

/**
 * Pins an integration so it never unloads due to idle
 */
export function pinIntegration(agentId: string, integrationId: string): void {
  const state = agentToolState.get(agentId)
  if (state) {
    state.pinnedIntegrations.add(integrationId)
    console.log(`[Tool Manager] Integration ${integrationId} pinned for agent ${agentId}`)
  }
}

/**
 * Unpins an integration, allowing it to be unloaded when idle
 */
export function unpinIntegration(agentId: string, integrationId: string): void {
  const state = agentToolState.get(agentId)
  if (state) {
    state.pinnedIntegrations.delete(integrationId)
    console.log(`[Tool Manager] Integration ${integrationId} unpinned for agent ${agentId}`)
  }
}

/**
 * Manually loads an integration immediately
 */
export async function manuallyLoadIntegration(
  agentId: string,
  integrationId: string,
  coreTools: Tool[]
): Promise<void> {
  try {
    const mcpTools = await getCachedMCPTools([integrationId])

    const state = agentToolState.get(agentId)
    if (state) {
      // Add to existing state
      if (!state.integrationIds.includes(integrationId)) {
        state.integrationIds.push(integrationId)
        state.tools.push(...mcpTools)
        state.messagesSinceUse.set(integrationId, 0)
      }
    } else {
      // Create new state
      agentToolState.set(agentId, {
        integrationIds: [integrationId],
        tools: mcpTools,
        loadedAt: Date.now(),
        lastUsed: Date.now(),
        messagesSinceUse: new Map([[integrationId, 0]]),
        pinnedIntegrations: new Set()
      })
    }

    console.log(`[Tool Manager] Manually loaded ${integrationId} for agent ${agentId}`)
  } catch (error) {
    console.error(`[Tool Manager] Failed to manually load ${integrationId}:`, error)
  }
}

/**
 * Manually unloads an integration immediately
 */
export function manuallyUnloadIntegration(agentId: string, integrationId: string): void {
  const state = agentToolState.get(agentId)
  if (state) {
    state.integrationIds = state.integrationIds.filter(id => id !== integrationId)
    state.tools = state.tools.filter(tool => !tool.name.startsWith(`${integrationId}_`))
    state.messagesSinceUse.delete(integrationId)
    state.pinnedIntegrations.delete(integrationId)

    // Cancel cooldown timer if active
    const timers = cooldownTimers.get(agentId)
    if (timers) {
      const timer = timers.get(integrationId)
      if (timer) {
        clearTimeout(timer)
        timers.delete(integrationId)
      }
    }

    console.log(`[Tool Manager] Manually unloaded ${integrationId} for agent ${agentId}`)
  }
}

/**
 * Gets the current tool state for an agent
 */
export function getAgentToolState(agentId: string): LoadedToolSet | undefined {
  return agentToolState.get(agentId)
}

/**
 * Clears all tool state for an agent (when agent is deleted)
 */
export function clearAgentTools(agentId: string): void {
  agentToolState.delete(agentId)

  // Cancel all cooldown timers
  const timers = cooldownTimers.get(agentId)
  if (timers) {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    cooldownTimers.delete(agentId)
  }

  console.log(`[Tool Manager] Cleared tools for agent ${agentId}`)
}

/**
 * Starts a cooldown timer for an integration
 */
function startCooldownTimer(agentId: string, integrationId: string, cooldownMs: number): void {
  // Initialize timers map for agent if needed
  if (!cooldownTimers.has(agentId)) {
    cooldownTimers.set(agentId, new Map())
  }

  const timers = cooldownTimers.get(agentId)!

  // Cancel existing timer if any
  const existingTimer = timers.get(integrationId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  // Start new timer
  const timer = setTimeout(() => {
    unloadIntegration(agentId, integrationId)
    timers.delete(integrationId)
  }, cooldownMs)

  timers.set(integrationId, timer)
}

/**
 * Unloads an integration after cooldown period
 */
function unloadIntegration(agentId: string, integrationId: string): void {
  const state = agentToolState.get(agentId)
  if (!state) return

  // Don't unload if pinned
  if (state.pinnedIntegrations.has(integrationId)) {
    console.log(`[Tool Manager] Skipping unload of pinned integration ${integrationId}`)
    return
  }

  // Remove from state
  state.integrationIds = state.integrationIds.filter(id => id !== integrationId)
  state.tools = state.tools.filter(tool => !tool.name.startsWith(`${integrationId}_`))
  state.messagesSinceUse.delete(integrationId)

  console.log(`[Tool Manager] Unloaded ${integrationId} for agent ${agentId} (idle timeout)`)
}
