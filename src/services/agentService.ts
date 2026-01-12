/**
 * Agent Service - Claude Agent SDK Integration
 *
 * Provides the same capabilities as Claude Code in terminal:
 * - Autonomous file operations (Read, Write, Edit)
 * - Shell command execution (Bash)
 * - File search (Glob, Grep)
 * - Web search and fetch
 * - Subagents for parallel work
 * - Session management
 */

import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKToolProgressMessage,
  type Options,
  type McpServerConfig,
  type AgentDefinition
} from '@anthropic-ai/claude-agent-sdk'

// Re-export types for consumers
export type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKToolProgressMessage,
  Options as AgentOptions
}

/**
 * Agent configuration options
 */
export interface AgentConfig {
  /** Working directory for the agent */
  cwd: string
  /** Tools the agent is allowed to use */
  allowedTools?: string[]
  /** Tools to explicitly disallow */
  disallowedTools?: string[]
  /** Permission mode */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  /** MCP servers to connect */
  mcpServers?: Record<string, McpServerConfig>
  /** Custom subagents */
  agents?: Record<string, AgentDefinition>
  /** System prompt override or append */
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  /** Maximum turns before stopping */
  maxTurns?: number
  /** Model to use */
  model?: string
  /** Include partial streaming messages */
  includePartialMessages?: boolean
  /** Session ID to resume */
  resume?: string
  /** Load project settings (CLAUDE.md) */
  settingSources?: ('user' | 'project' | 'local')[]
  /** Abort controller for cancellation */
  abortController?: AbortController
}

/**
 * Default tools for general-purpose agent work
 */
export const DEFAULT_AGENT_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task'
]

/**
 * Run an agent query with the Claude Agent SDK
 *
 * @param prompt - The user's prompt/request
 * @param config - Agent configuration
 * @returns AsyncGenerator of SDK messages
 *
 * @example
 * ```typescript
 * for await (const message of runAgent("Fix the bug in auth.ts", {
 *   cwd: "/path/to/project",
 *   permissionMode: 'acceptEdits'
 * })) {
 *   handleMessage(message)
 * }
 * ```
 */
export async function* runAgent(
  prompt: string,
  config: AgentConfig
): AsyncGenerator<SDKMessage> {
  const options: Options = {
    cwd: config.cwd,
    allowedTools: config.allowedTools ?? DEFAULT_AGENT_TOOLS,
    disallowedTools: config.disallowedTools,
    permissionMode: config.permissionMode ?? 'acceptEdits',
    mcpServers: config.mcpServers,
    agents: config.agents,
    systemPrompt: config.systemPrompt,
    maxTurns: config.maxTurns,
    model: config.model,
    includePartialMessages: config.includePartialMessages ?? true,
    resume: config.resume,
    settingSources: config.settingSources ?? ['project'], // Load CLAUDE.md by default
    abortController: config.abortController,
  }

  // Remove undefined values to use SDK defaults
  const cleanOptions = Object.fromEntries(
    Object.entries(options).filter(([_, v]) => v !== undefined)
  ) as Options

  for await (const message of query({ prompt, options: cleanOptions })) {
    yield message
  }
}

/**
 * Check if Claude Code CLI is installed
 * Required for the Agent SDK to work
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  try {
    // Use a neutral cwd - the command is just checking if claude is in PATH
    const result = await window.electronAPI.bash.execute('claude --version', '.')
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Get the installed Claude Code version
 */
export async function getClaudeCodeVersion(): Promise<string | null> {
  try {
    const result = await window.electronAPI.bash.execute('claude --version', '.')
    if (result.exitCode === 0) {
      return result.stdout.trim()
    }
    return null
  } catch {
    return null
  }
}

/**
 * Helper to check if a message is an assistant message with content
 */
export function isAssistantMessage(message: SDKMessage): message is SDKAssistantMessage {
  return message.type === 'assistant'
}

/**
 * Helper to check if a message is a result (success or error)
 */
export function isResultMessage(message: SDKMessage): message is SDKResultMessage {
  return message.type === 'result'
}

/**
 * Helper to check if a message is a system init message
 */
export function isSystemInitMessage(message: SDKMessage): message is SDKSystemMessage {
  return message.type === 'system' && 'subtype' in message && message.subtype === 'init'
}

/**
 * Helper to check if a message is a tool progress message
 */
export function isToolProgressMessage(message: SDKMessage): message is SDKToolProgressMessage {
  return message.type === 'tool_progress'
}

/**
 * Extract text content from an assistant message
 */
export function getAssistantText(message: SDKAssistantMessage): string {
  const textParts: string[] = []
  for (const block of message.message.content) {
    if (block.type === 'text' && 'text' in block) {
      textParts.push(block.text as string)
    }
  }
  return textParts.join('')
}

/**
 * Extract tool use blocks from an assistant message
 */
export function getToolUseBlocks(message: SDKAssistantMessage) {
  return message.message.content.filter(
    (block): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
      block.type === 'tool_use'
  )
}

/**
 * Convert MCP integration configs to SDK format
 */
export function convertMCPConfigs(
  integrationConfigs: Record<string, { enabled: boolean; envVars: Record<string, string> }>,
  integrations: Array<{ id: string; command: string; args: string[] }>
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {}

  for (const integration of integrations) {
    const config = integrationConfigs[integration.id]
    if (config?.enabled) {
      mcpServers[integration.id] = {
        command: integration.command,
        args: integration.args,
        env: config.envVars
      }
    }
  }

  return mcpServers
}
