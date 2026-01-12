/**
 * Integration Tool
 * Handles creating custom MCP integrations
 */

import { useAppStore } from '@/stores/appStore'
import type { MCPIntegration } from '@/stores/appStore'

interface CreateIntegrationInput {
  name: string
  description?: string
  npmPackage: string
  mention: string
  mentionAliases?: string[]
  category?: 'browser' | 'google' | 'search' | 'cloud' | 'media' | 'custom'
  requiredEnvVars?: Array<{
    key: string
    label: string
    type: 'apiKey' | 'text'
    description?: string
  }>
  toolPrefix: string
  apiKeyUrl?: string
  source?: string
}

/**
 * Execute the create_mcp_integration tool
 */
export async function executeCreateIntegration(
  input: Record<string, unknown>
): Promise<string> {
  const params = input as unknown as CreateIntegrationInput

  // Validate required fields
  if (!params.name) {
    return JSON.stringify({ success: false, error: 'Missing required field: name' })
  }
  if (!params.npmPackage) {
    return JSON.stringify({ success: false, error: 'Missing required field: npmPackage' })
  }
  if (!params.mention) {
    return JSON.stringify({ success: false, error: 'Missing required field: mention' })
  }
  if (!params.toolPrefix) {
    return JSON.stringify({ success: false, error: 'Missing required field: toolPrefix' })
  }

  // Ensure mention starts with @
  const mention = params.mention.startsWith('@') ? params.mention : `@${params.mention}`

  // Ensure toolPrefix ends with _
  const toolPrefix = params.toolPrefix.endsWith('_') ? params.toolPrefix : `${params.toolPrefix}_`

  // Generate a unique ID from the name
  const id = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  // Build the integration object
  const integration: MCPIntegration = {
    id,
    name: params.name,
    description: params.description || `Custom integration: ${params.name}`,
    mention: mention.toLowerCase(),
    mentionAliases: params.mentionAliases?.map(a => a.startsWith('@') ? a.toLowerCase() : `@${a.toLowerCase()}`),
    category: params.category || 'custom',
    command: 'npx',
    args: ['-y', params.npmPackage],
    requiredEnvVars: params.requiredEnvVars || [],
    toolPrefix,
    apiKeyUrl: params.apiKeyUrl,
    isCustom: true,
    source: params.source,
  }

  try {
    // Register with the MCP registry via IPC
    const result = await window.electronAPI.mcp.registerCustomIntegration(integration)

    if (!result.success) {
      return JSON.stringify({
        success: false,
        error: result.error || 'Failed to register integration'
      })
    }

    // Also add to the app store for persistence
    const addCustomIntegration = useAppStore.getState().addCustomIntegration
    addCustomIntegration(integration)

    return JSON.stringify({
      success: true,
      message: `Integration "${params.name}" created successfully!`,
      integration: {
        id: integration.id,
        name: integration.name,
        mention: integration.mention,
        mentionAliases: integration.mentionAliases,
        category: integration.category,
        npmPackage: params.npmPackage,
        toolPrefix: integration.toolPrefix,
        requiresConfig: integration.requiredEnvVars.length > 0,
      },
      nextSteps: integration.requiredEnvVars.length > 0
        ? `Configure the integration in Settings > Integrations > Custom. You'll need to provide: ${integration.requiredEnvVars.map(v => v.label).join(', ')}`
        : `The integration is ready! Enable it in Settings > Integrations, then use ${integration.mention} in chat.`
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating integration'
    })
  }
}
