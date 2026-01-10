/**
 * Conversation Storage Service
 * Handles saving and loading conversation history
 */

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string // ISO string for serialization
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
}

export interface Conversation {
  id: string
  title: string
  createdAt: string // ISO string
  updatedAt: string // ISO string
  model: string
  messages: ConversationMessage[]
  bookmarks: string[] // Message IDs that are bookmarked
  workspace: string | null
}

export interface ConversationMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string // First few characters of last message
}

/**
 * Generate a unique conversation ID
 */
export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate a conversation title from messages
 */
export function generateTitle(messages: ConversationMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim()
    // Take first 50 characters or first sentence
    const firstSentence = content.split(/[.!?]/)[0]
    return firstSentence.length > 50
      ? content.substring(0, 47) + '...'
      : firstSentence || content.substring(0, 50)
  }
  return `Conversation ${new Date().toLocaleDateString()}`
}

/**
 * Format conversation for export to markdown
 */
export function exportToMarkdown(conversation: Conversation): string {
  const lines: string[] = []

  lines.push(`# ${conversation.title}`)
  lines.push('')
  lines.push(`**Created:** ${new Date(conversation.createdAt).toLocaleString()}`)
  lines.push(`**Model:** ${conversation.model}`)
  if (conversation.workspace) {
    lines.push(`**Workspace:** ${conversation.workspace}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const message of conversation.messages) {
    if (message.role === 'tool') continue // Skip tool messages in export

    const timestamp = new Date(message.timestamp).toLocaleString()
    const role = message.role === 'user' ? '**You**' : '**Claude**'
    const bookmarkIndicator = message.bookmarked ? ' ⭐' : ''

    lines.push(`### ${role} (${timestamp})${bookmarkIndicator}`)
    lines.push('')
    lines.push(message.content)
    lines.push('')
  }

  return lines.join('\n')
}
