/**
 * Title Generator Service
 *
 * Generates short, descriptive titles for chat conversations
 * using Claude Haiku for speed and cost efficiency.
 */

import Anthropic from '@anthropic-ai/sdk'

/**
 * Generate a 2-4 word title for a chat based on the first message
 *
 * @param firstMessage - The user's first message in the conversation
 * @param apiKey - Anthropic API key
 * @returns A short descriptive title
 */
export async function generateChatTitle(
  firstMessage: string,
  apiKey: string
): Promise<string> {
  // Fallback title if generation fails
  const fallbackTitle = 'New Chat'

  if (!apiKey || !firstMessage.trim()) {
    return fallbackTitle
  }

  try {
    const anthropic = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    })

    // Use Haiku for speed and cost efficiency
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `Generate a 2-4 word title that summarizes this chat request. Be concise and descriptive. Only output the title, no quotes or punctuation.

Request: "${firstMessage.slice(0, 300)}"

Title:`,
      }],
    })

    // Extract text from response
    const content = response.content[0]
    if (content.type === 'text') {
      const title = content.text.trim()
        // Remove any quotes that might have been added
        .replace(/^["']|["']$/g, '')
        // Remove trailing punctuation
        .replace(/[.!?]$/, '')
        // Capitalize first letter of each word
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      // Validate the title isn't too long
      if (title.length > 40) {
        return title.slice(0, 37) + '...'
      }

      return title || fallbackTitle
    }

    return fallbackTitle
  } catch (error) {
    console.error('Failed to generate chat title:', error)
    return fallbackTitle
  }
}

/**
 * Generate a title synchronously from the first user message
 * (simple extraction without AI)
 *
 * @param firstMessage - The user's first message
 * @returns A simple extracted title
 */
export function generateSimpleTitle(firstMessage: string): string {
  if (!firstMessage.trim()) {
    return 'New Chat'
  }

  // Get first line or first 40 characters
  const firstLine = firstMessage.split('\n')[0].trim()
  const title = firstLine.slice(0, 40)

  // Clean up
  const cleaned = title
    .replace(/[@#]/g, '') // Remove mentions
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  if (cleaned.length < firstLine.length) {
    return cleaned + '...'
  }

  return cleaned || 'New Chat'
}
