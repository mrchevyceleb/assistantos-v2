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
 * Check if context should be compacted (auto-compaction threshold)
 * Triggers at 75% to leave buffer room for the response
 */
export function shouldCompact(percentage: number): boolean {
  return percentage >= 75
}

/**
 * Check if context usage is critical and requires immediate attention
 * Triggers at 90% - user needs to take action NOW
 */
export function isContextCritical(percentage: number): boolean {
  return percentage >= 90
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

/**
 * Document size thresholds for smart truncation
 */
export const DOCUMENT_SIZE_THRESHOLDS = {
  /** Documents smaller than this are included in full */
  SMALL: 5000,
  /** Documents between SMALL and MEDIUM get head/tail truncation */
  MEDIUM: 15000,
  /** Documents larger than MEDIUM get aggressive truncation */
  LARGE: 50000,
  /** Maximum characters to include from any single document */
  MAX_CHARS: 30000,
  /** Lines to show from start for head/tail truncation */
  HEAD_LINES: 100,
  /** Lines to show from end for head/tail truncation */
  TAIL_LINES: 50,
}

/**
 * Result of document truncation
 */
export interface TruncatedDocument {
  content: string
  wasTruncated: boolean
  originalSize: number
  truncatedSize: number
  truncationType: 'none' | 'head_tail' | 'aggressive'
  warningMessage?: string
}

/**
 * Smart truncation for large documents
 * - Small documents: included in full
 * - Medium documents: head + tail with middle truncated
 * - Large documents: aggressive truncation with summary header
 */
export function truncateDocumentSmart(
  content: string,
  filename: string,
  options?: {
    maxChars?: number
    headLines?: number
    tailLines?: number
  }
): TruncatedDocument {
  const maxChars = options?.maxChars ?? DOCUMENT_SIZE_THRESHOLDS.MAX_CHARS
  const headLines = options?.headLines ?? DOCUMENT_SIZE_THRESHOLDS.HEAD_LINES
  const tailLines = options?.tailLines ?? DOCUMENT_SIZE_THRESHOLDS.TAIL_LINES
  const originalSize = content.length

  // Small documents - include in full
  if (originalSize <= DOCUMENT_SIZE_THRESHOLDS.SMALL) {
    return {
      content,
      wasTruncated: false,
      originalSize,
      truncatedSize: originalSize,
      truncationType: 'none'
    }
  }

  const lines = content.split('\n')
  const lineCount = lines.length
  const estimatedTokens = estimateTokens(content)

  // Medium documents - head/tail truncation
  if (originalSize <= DOCUMENT_SIZE_THRESHOLDS.MEDIUM) {
    if (lineCount <= headLines + tailLines) {
      // Not enough lines to truncate meaningfully
      if (originalSize <= maxChars) {
        return {
          content,
          wasTruncated: false,
          originalSize,
          truncatedSize: originalSize,
          truncationType: 'none'
        }
      }
    }

    const headContent = lines.slice(0, headLines).join('\n')
    const tailContent = lines.slice(-tailLines).join('\n')
    const omittedLines = lineCount - headLines - tailLines
    const omittedChars = originalSize - headContent.length - tailContent.length

    const truncatedContent = `${headContent}

[... ${omittedLines.toLocaleString()} lines (~${formatTokenCount(estimateTokens(content.slice(headContent.length, -tailContent.length)))} tokens) omitted from middle of file ...]

${tailContent}`

    return {
      content: truncatedContent,
      wasTruncated: true,
      originalSize,
      truncatedSize: truncatedContent.length,
      truncationType: 'head_tail',
      warningMessage: `Document "${filename}" truncated: showing first ${headLines} and last ${tailLines} lines (${omittedChars.toLocaleString()} chars omitted)`
    }
  }

  // Large documents - aggressive truncation with header summary
  const headChars = Math.floor(maxChars * 0.7) // 70% from start
  const tailChars = Math.floor(maxChars * 0.3) // 30% from end

  // Get head content (try to end at line boundary)
  let headContent = content.slice(0, headChars)
  const lastNewlineInHead = headContent.lastIndexOf('\n')
  if (lastNewlineInHead > headChars * 0.8) {
    headContent = headContent.slice(0, lastNewlineInHead)
  }

  // Get tail content (try to start at line boundary)
  let tailContent = content.slice(-tailChars)
  const firstNewlineInTail = tailContent.indexOf('\n')
  if (firstNewlineInTail > 0 && firstNewlineInTail < tailChars * 0.2) {
    tailContent = tailContent.slice(firstNewlineInTail + 1)
  }

  const omittedChars = originalSize - headContent.length - tailContent.length

  // Create a summary header for large files
  const fileExtension = filename.split('.').pop()?.toLowerCase() || ''
  const fileTypeHint = getFileTypeHint(fileExtension)

  const truncatedContent = `[LARGE FILE: ${filename}]
[Original: ${originalSize.toLocaleString()} chars, ~${formatTokenCount(estimatedTokens)} tokens]
[Type: ${fileTypeHint}]
[Showing: first ~${headContent.length.toLocaleString()} chars + last ~${tailContent.length.toLocaleString()} chars]

=== START OF FILE ===
${headContent}

[... ${omittedChars.toLocaleString()} characters omitted from middle (~${formatTokenCount(estimateTokens(content.slice(headContent.length, -tailContent.length)))}) ...]

=== END OF FILE ===
${tailContent}`

  return {
    content: truncatedContent,
    wasTruncated: true,
    originalSize,
    truncatedSize: truncatedContent.length,
    truncationType: 'aggressive',
    warningMessage: `Large document "${filename}" aggressively truncated: ${originalSize.toLocaleString()} chars -> ${truncatedContent.length.toLocaleString()} chars (~${formatTokenCount(estimatedTokens)} -> ~${formatTokenCount(estimateTokens(truncatedContent))} tokens)`
  }
}

/**
 * Get a human-readable hint about file type
 */
function getFileTypeHint(extension: string): string {
  const typeMap: Record<string, string> = {
    'ts': 'TypeScript source',
    'tsx': 'TypeScript React component',
    'js': 'JavaScript source',
    'jsx': 'JavaScript React component',
    'py': 'Python source',
    'md': 'Markdown document',
    'json': 'JSON data',
    'yaml': 'YAML configuration',
    'yml': 'YAML configuration',
    'css': 'CSS stylesheet',
    'scss': 'SCSS stylesheet',
    'html': 'HTML document',
    'sql': 'SQL script',
    'sh': 'Shell script',
    'ps1': 'PowerShell script',
    'txt': 'Plain text',
    'log': 'Log file',
    'csv': 'CSV data',
    'xml': 'XML document',
  }
  return typeMap[extension] || `${extension.toUpperCase()} file`
}

/**
 * Check if a document should be truncated based on size
 */
export function shouldTruncateDocument(content: string): boolean {
  return content.length > DOCUMENT_SIZE_THRESHOLDS.SMALL
}

/**
 * Estimate context impact of adding a document
 * Returns percentage of context that would be used
 */
export function estimateDocumentImpact(
  content: string,
  currentContextUsage: ContextUsage
): {
  additionalTokens: number
  newTotal: number
  newPercentage: number
  wouldExceedThreshold: boolean
} {
  const additionalTokens = estimateTokens(content)
  const newTotal = currentContextUsage.total + additionalTokens
  const newPercentage = (newTotal / currentContextUsage.max) * 100

  return {
    additionalTokens,
    newTotal,
    newPercentage,
    wouldExceedThreshold: newPercentage >= 80
  }
}
