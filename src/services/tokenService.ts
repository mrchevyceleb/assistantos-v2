/**
 * Token Counting Service
 * Provides token estimation and context usage tracking for Claude models
 */

import { ModelId } from '@/stores/appStore'

// Model context limits (tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-3-5-haiku-20241022': 200000,
}

// Default context limit for unknown models
const DEFAULT_CONTEXT_LIMIT = 200000

/**
 * Simple token estimation based on character count
 * Approximation: ~4 characters per token for English text
 * This is a rough estimate - actual tokenization may vary
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // More accurate estimation accounting for:
  // - Average ~4 chars per token for English
  // - Special characters and whitespace tend to be separate tokens
  // - Code has more special characters = more tokens per char
  const baseEstimate = Math.ceil(text.length / 4)
  // Add small overhead for special tokens and formatting
  return Math.ceil(baseEstimate * 1.05)
}

/**
 * Get the maximum context window for a model
 */
export function getMaxTokens(modelId: ModelId): number {
  return MODEL_CONTEXT_LIMITS[modelId] || DEFAULT_CONTEXT_LIMIT
}

/**
 * Format token count for display (e.g., 4200 -> "4.2K")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

/**
 * Message for context calculation
 */
interface ContextMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  toolResult?: string
}

/**
 * Tool definition for context calculation
 */
interface ContextTool {
  name: string
  description: string
  input_schema?: object
}

/**
 * Context usage breakdown
 */
export interface ContextUsage {
  messages: number
  systemPrompt: number
  tools: number
  total: number
  max: number
  percentage: number
}

/**
 * Calculate total context usage from all components
 */
export function getContextUsage(
  messages: ContextMessage[],
  systemPrompt: string,
  tools: ContextTool[],
  modelId: ModelId
): ContextUsage {
  // Estimate tokens for each message
  const messageTokens = messages.reduce((total, msg) => {
    let tokens = estimateTokens(msg.content)
    // Add overhead for message structure (role, etc.)
    tokens += 4
    // Tool messages have additional structure
    if (msg.role === 'tool') {
      tokens += estimateTokens(msg.toolName || '')
      tokens += estimateTokens(msg.toolResult || '')
      tokens += 10 // Tool result structure overhead
    }
    return total + tokens
  }, 0)

  // Estimate system prompt tokens
  const systemPromptTokens = estimateTokens(systemPrompt)

  // Estimate tool definition tokens
  const toolTokens = tools.reduce((total, tool) => {
    let tokens = estimateTokens(tool.name)
    tokens += estimateTokens(tool.description)
    // Schema adds significant tokens
    if (tool.input_schema) {
      tokens += estimateTokens(JSON.stringify(tool.input_schema))
    }
    return total + tokens
  }, 0)

  const total = messageTokens + systemPromptTokens + toolTokens
  const max = getMaxTokens(modelId)
  const percentage = (total / max) * 100

  return {
    messages: messageTokens,
    systemPrompt: systemPromptTokens,
    tools: toolTokens,
    total,
    max,
    percentage
  }
}

/**
 * Get the color class based on context usage percentage
 */
export function getContextUsageColor(percentage: number): 'green' | 'amber' | 'red' {
  if (percentage >= 80) return 'red'
  if (percentage >= 50) return 'amber'
  return 'green'
}

/**
 * Check if context should be compacted
 */
export function shouldCompact(percentage: number): boolean {
  return percentage >= 80
}

/**
 * Compact summary message type
 */
export interface CompactedSummary {
  role: 'system'
  content: string
  isContextSummary: true
}

/**
 * Generate a prompt to ask Claude to summarize the conversation
 * This will be used with a smaller model for efficiency
 */
export function generateCompactionPrompt(messages: ContextMessage[], keepCount: number = 10): string {
  // Get messages to summarize (all except the last N message pairs)
  const messagesToSummarize = messages.slice(0, Math.max(0, messages.length - keepCount))

  if (messagesToSummarize.length === 0) {
    return ''
  }

  const conversationText = messagesToSummarize
    .filter(m => m.role !== 'tool') // Exclude tool messages from summary
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  return `Please create a concise summary of this conversation history. Focus on:
1. Key decisions made
2. Important information shared
3. Context needed to continue the conversation
4. Any ongoing tasks or goals

Conversation to summarize:
${conversationText}

Provide a summary that preserves the essential context in a compact format.`
}

/**
 * Format compacted summary for injection into conversation
 */
export function formatCompactedSummary(summary: string): string {
  return `<context_summary>
The following is a summary of earlier conversation that has been compacted to save context:

${summary}
</context_summary>`
}
