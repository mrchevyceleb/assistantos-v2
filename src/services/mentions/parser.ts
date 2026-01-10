/**
 * @mention Parser
 * Parses chat input for @mentions and provides autocomplete suggestions
 * All data is fetched dynamically from the MCP registry - no hardcoded mappings
 */

export interface ParsedMessage {
  text: string
  mentions: string[]
  mentionPositions: Array<{
    start: number
    end: number
    mention: string
    integrationId: string
  }>
}

export interface MentionSuggestion {
  mention: string
  integrationId: string
  name: string
  description: string
  isPrimary: boolean
}

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
  allMentionsCache = await window.electronAPI.mcp.getAllMentions()
  return allMentionsCache
}

/**
 * Parse a message for @mentions
 * Returns the cleaned text and list of integration IDs to activate
 */
export async function parseMessage(input: string): Promise<ParsedMessage> {
  const mentionMap = await getMentionMap()
  const mentionRegex = /@[\w-]+/g
  const mentions: string[] = []
  const positions: ParsedMessage['mentionPositions'] = []

  let match
  while ((match = mentionRegex.exec(input)) !== null) {
    const mention = match[0].toLowerCase()
    const integrationId = mentionMap[mention]

    if (integrationId) {
      if (!mentions.includes(integrationId)) {
        mentions.push(integrationId)
      }
      positions.push({
        start: match.index,
        end: match.index + match[0].length,
        mention,
        integrationId
      })
    }
  }

  return {
    text: input,
    mentions,
    mentionPositions: positions
  }
}

/**
 * Get autocomplete suggestions for a partial @mention
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
 * Check if text ends with an incomplete @mention
 * Returns the partial mention if found, or null
 */
export function getPartialMention(text: string): string | null {
  // Match @ followed by word characters at the end of the string
  const match = text.match(/@[\w-]*$/)
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

  const mentionRegex = /@[\w-]+/g
  const mentions: string[] = []

  let match
  while ((match = mentionRegex.exec(input)) !== null) {
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
  return text.replace(/@[\w-]+/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Highlight mentions in text (returns array of segments)
 */
export function highlightMentions(text: string): Array<{ text: string; isMention: boolean; integrationId?: string }> {
  const segments: Array<{ text: string; isMention: boolean; integrationId?: string }> = []
  const mentionRegex = /@[\w-]+/g
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
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
