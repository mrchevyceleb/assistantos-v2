/**
 * @mention Parser
 * Parses chat input for @mentions and provides autocomplete suggestions
 * Supports both MCP integration mentions and workspace document mentions
 */

// Regex patterns for mention detection
// Matches @word, @path/to/file, or @file.ext (for documents)
const MENTION_WITH_PATHS_REGEX = /@[\w\-./]+/g
// Matches simple @word only (for integrations)
const MENTION_SIMPLE_REGEX = /@[\w-]+/g

export interface ParsedMessage {
  text: string
  mentions: string[]
  mentionPositions: Array<{
    start: number
    end: number
    mention: string
    integrationId: string
  }>
  documentMentions: DocumentMention[]
}

export interface MentionSuggestion {
  mention: string
  integrationId: string
  name: string
  description: string
  isPrimary: boolean
  type: 'integration'
}

export interface DocumentMention {
  mention: string
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
}

export interface FileMentionSuggestion {
  mention: string
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  description: string
  type: 'document'
}

export type UnifiedSuggestion = MentionSuggestion | FileMentionSuggestion

// Cache for mention map to avoid repeated IPC calls
let mentionMapCache: Record<string, string> | null = null
let allMentionsCache: MentionSuggestion[] | null = null

/**
 * Clear the mention caches (call when integrations change)
 */
export function clearMentionCache(): void {
  mentionMapCache = null
  allMentionsCache = null
}

/**
 * Get the mention map from the registry
 */
async function getMentionMap(): Promise<Record<string, string>> {
  if (mentionMapCache) return mentionMapCache
  mentionMapCache = await window.electronAPI.mcp.getMentionMap()
  return mentionMapCache
}

/**
 * Get all mentions for autocomplete
 */
async function getAllMentions(): Promise<MentionSuggestion[]> {
  if (allMentionsCache) return allMentionsCache
  const rawMentions = await window.electronAPI.mcp.getAllMentions()
  // Add type field to raw mentions
  allMentionsCache = rawMentions.map(m => ({ ...m, type: 'integration' as const }))
  return allMentionsCache
}

/**
 * Get file mention suggestions from workspace
 * @param searchTerm - The search term (without @)
 * @param workspacePath - The workspace path to search in
 */
export async function getFileMentionSuggestions(
  searchTerm: string,
  workspacePath: string | null
): Promise<FileMentionSuggestion[]> {
  if (!workspacePath || searchTerm.length < 1) return []

  try {
    const files = await window.electronAPI.fs.searchFiles(workspacePath, searchTerm)
    return files.map(file => ({
      mention: `@${file.relativePath}`,
      name: file.name,
      path: file.path,
      relativePath: file.relativePath,
      isDirectory: file.isDirectory,
      description: file.isDirectory ? `📁 ${file.relativePath}` : `📄 ${file.relativePath}`,
      type: 'document' as const
    }))
  } catch (error) {
    console.error('Error getting file suggestions:', error)
    return []
  }
}

/**
 * Parse a message for @mentions
 * Returns the cleaned text and list of integration IDs to activate
 * Also extracts document mentions (file paths)
 */
export async function parseMessage(input: string, workspacePath: string | null = null): Promise<ParsedMessage> {
  const mentionMap = await getMentionMap()
  const mentions: string[] = []
  const positions: ParsedMessage['mentionPositions'] = []
  const documentMentions: DocumentMention[] = []

  let match
  while ((match = MENTION_WITH_PATHS_REGEX.exec(input)) !== null) {
    const mentionText = match[0]
    const mentionLower = mentionText.toLowerCase()
    const integrationId = mentionMap[mentionLower]

    if (integrationId) {
      // This is an integration mention
      if (!mentions.includes(integrationId)) {
        mentions.push(integrationId)
      }
      positions.push({
        start: match.index,
        end: match.index + mentionText.length,
        mention: mentionLower,
        integrationId
      })
    } else if (workspacePath && (mentionText.includes('/') || mentionText.includes('.'))) {
      // This might be a document mention (has path separator or file extension)
      const relativePath = mentionText.slice(1) // Remove the @
      documentMentions.push({
        mention: mentionText,
        name: relativePath.split('/').pop() || relativePath,
        path: `${workspacePath}/${relativePath}`,
        relativePath,
        isDirectory: !relativePath.includes('.')
      })
    }
  }

  return {
    text: input,
    mentions,
    mentionPositions: positions,
    documentMentions
  }
}

/**
 * Get autocomplete suggestions for a partial @mention (integrations only)
 * @param partial - The partial text including @ (e.g., "@gm", "@cal")
 */
export async function getMentionSuggestions(partial: string): Promise<MentionSuggestion[]> {
  const allMentions = await getAllMentions()
  const lower = partial.toLowerCase()

  return allMentions
    .filter(m => m.mention.startsWith(lower))
    .sort((a, b) => {
      // Primary mentions first
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1
      }
      // Then by mention length (shorter = more relevant)
      return a.mention.length - b.mention.length
    })
}

/**
 * Get unified autocomplete suggestions for a partial @mention
 * Includes both integrations and workspace documents
 * @param partial - The partial text including @ (e.g., "@gm", "@README")
 * @param workspacePath - The workspace path to search for documents
 */
export async function getUnifiedSuggestions(
  partial: string,
  workspacePath: string | null
): Promise<UnifiedSuggestion[]> {
  const searchTerm = partial.slice(1) // Remove @
  const lower = partial.toLowerCase()

  // Get integration suggestions
  const allMentions = await getAllMentions()
  const integrationSuggestions = allMentions
    .filter(m => m.mention.startsWith(lower))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.mention.length - b.mention.length
    })
    .slice(0, 5)

  // Get file suggestions if workspace is set and search term has content
  let fileSuggestions: FileMentionSuggestion[] = []
  if (workspacePath && searchTerm.length >= 1) {
    fileSuggestions = await getFileMentionSuggestions(searchTerm, workspacePath)
    fileSuggestions = fileSuggestions.slice(0, 7) // Limit file suggestions
  }

  // Combine: integrations first, then files
  return [...integrationSuggestions, ...fileSuggestions]
}

/**
 * Check if text ends with an incomplete @mention
 * Returns the partial mention if found, or null
 * Now supports file paths with dots and slashes
 */
export function getPartialMention(text: string): string | null {
  // Match @ followed by word characters, dots, hyphens, or slashes at the end of the string
  const match = text.match(/@[\w\-./]*$/)
  return match ? match[0] : null
}

/**
 * Complete a mention in the text
 * @param text - Current input text
 * @param mention - Full mention to insert (e.g., "@gmail")
 */
export function completeMention(text: string, mention: string): string {
  // Replace the partial mention with the full one
  const partial = getPartialMention(text)
  if (partial) {
    return text.slice(0, -partial.length) + mention + ' '
  }
  return text + mention + ' '
}

/**
 * Extract just the integration IDs from a message (sync version using cached data)
 * Use this when you need a quick check and can accept potentially stale cache
 */
export function extractMentionsSync(input: string): string[] {
  if (!mentionMapCache) return []

  const mentions: string[] = []

  let match
  while ((match = MENTION_SIMPLE_REGEX.exec(input)) !== null) {
    const mention = match[0].toLowerCase()
    const integrationId = mentionMapCache[mention]
    if (integrationId && !mentions.includes(integrationId)) {
      mentions.push(integrationId)
    }
  }

  return mentions
}

/**
 * Remove mentions from text for cleaner display
 */
export function stripMentions(text: string): string {
  return text.replace(MENTION_SIMPLE_REGEX, '').replace(/\s+/g, ' ').trim()
}

/**
 * Highlight mentions in text (returns array of segments)
 */
export function highlightMentions(text: string): Array<{ text: string; isMention: boolean; integrationId?: string }> {
  const segments: Array<{ text: string; isMention: boolean; integrationId?: string }> = []
  let lastIndex = 0
  let match

  while ((match = MENTION_SIMPLE_REGEX.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isMention: false
      })
    }

    // Add mention
    const mention = match[0].toLowerCase()
    const integrationId = mentionMapCache?.[mention]
    segments.push({
      text: match[0],
      isMention: true,
      integrationId
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isMention: false
    })
  }

  return segments
}
