import Anthropic from '@anthropic-ai/sdk'

const CLASSIFICATION_PROMPT = `You are an intent classifier for an AI assistant. Given a user message, determine which external services (if any) are needed.

Available services:
- gmail: Email access (reading, sending, searching emails)
- calendar: Calendar management (events, meetings, schedules)
- perplexity: Web research and current information lookup
- brave: Web search
- playwright: Browser automation (screenshots, testing, navigation)
- vercel: Cloud deployment and hosting
- browserbase: Cloud browser automation
- context7: Code search and analysis
- nano-banana: Media processing
- gemini: AI capabilities including image generation

Return ONLY a JSON array of service IDs needed, or empty array if none needed.

Examples:
User: "check my email"
Response: ["gmail"]

User: "what's on my schedule tomorrow"
Response: ["calendar"]

User: "search the web for best practices"
Response: ["brave"]

User: "check my calendar and emails"
Response: ["calendar", "gmail"]

User: "create a React component"
Response: []

User: "deploy the app"
Response: ["vercel"]

Now classify this message:`

/**
 * Uses Claude Haiku to classify ambiguous user intent
 * @param message - The user's message
 * @param apiKey - Anthropic API key
 * @param enabledIntegrations - List of enabled integration IDs to filter results
 * @returns Array of integration IDs to load
 */
export async function aiClassifyIntent(
  message: string,
  apiKey: string,
  enabledIntegrations: string[]
): Promise<string[]> {
  try {
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true
    })

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Fast and cheap (~$0.0001/request)
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `${CLASSIFICATION_PROMPT}\n\n"${message}"`
      }]
    })

    const content = response.content[0]
    if (content.type === 'text') {
      // Parse JSON response
      const text = content.text.trim()

      // Handle JSON that might have markdown code blocks
      const jsonMatch = text.match(/\[.*\]/s)
      if (!jsonMatch) {
        console.warn('[AI Fallback] No JSON array found in response:', text)
        return []
      }

      const parsed = JSON.parse(jsonMatch[0])

      // Validate it's an array
      if (!Array.isArray(parsed)) {
        console.warn('[AI Fallback] Response is not an array:', parsed)
        return []
      }

      // Filter to only enabled integrations
      const filtered = parsed.filter((id: string) =>
        typeof id === 'string' && enabledIntegrations.includes(id)
      )

      console.log('[AI Fallback] Classified:', message.substring(0, 50), '→', filtered)

      return filtered
    }
  } catch (error) {
    console.error('[AI Fallback] Classification failed:', error)
    // Graceful fallback - return empty array
    return []
  }

  return []
}
