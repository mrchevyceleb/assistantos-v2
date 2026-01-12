import type { Message } from '@/types/chat'

export interface IntentMatch {
  integrationId: string
  confidence: number // 0.0 - 1.0
  trigger: string // What triggered the match (for debugging)
}

interface IntentPattern {
  integrationId: string
  keywords: string[]
  patterns: RegExp[]
  contextual: (message: string, history: Message[]) => boolean
  priority: number // Higher = checked first
}

// Comprehensive intent patterns for all MCP integrations
const INTENT_PATTERNS: IntentPattern[] = [
  // Gmail - Email management
  {
    integrationId: 'gmail',
    keywords: ['email', 'inbox', 'gmail', 'mail', 'message', 'compose', 'send', 'reply'],
    patterns: [
      /check\s+(my\s+)?(email|inbox|mail)/i,
      /send\s+(an?\s+)?email/i,
      /reply\s+to/i,
      /draft\s+(an?\s+)?email/i,
      /read\s+(my\s+)?(email|message)/i,
      /inbox/i,
      /unread\s+(email|message)/i,
      /compose\s+(an?\s+)?email/i
    ],
    contextual: (msg, history) => {
      // If last user message mentioned email, likely continuation
      const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]
      if (!lastUserMsg) return false

      const emailTerms = ['email', 'message', 'inbox', 'gmail', 'mail']
      const hasEmailContext = emailTerms.some(term =>
        lastUserMsg.content.toLowerCase().includes(term)
      )

      // Check for pronouns that might refer to emails
      const pronouns = ['it', 'them', 'that', 'this', 'those']
      const hasPronoun = pronouns.some(p =>
        new RegExp(`\\b${p}\\b`, 'i').test(msg)
      )

      return hasEmailContext && hasPronoun
    },
    priority: 10
  },

  // Google Calendar - Scheduling
  {
    integrationId: 'calendar',
    keywords: ['calendar', 'meeting', 'schedule', 'event', 'appointment', 'remind'],
    patterns: [
      /what('?s| is)\s+(on\s+)?my\s+calendar/i,
      /schedule\s+(a\s+)?(meeting|call|appointment)/i,
      /create\s+(an?\s+)?(event|meeting)/i,
      /check\s+(my\s+)?schedule/i,
      /(add|set)\s+(a\s+)?(reminder|event)/i,
      /what('?s| is)\s+tomorrow/i,
      /free\s+(today|tomorrow|this\s+week)/i,
      /book\s+(a\s+)?(meeting|time)/i,
      /when\s+(am\s+i|is\s+my)/i
    ],
    contextual: (msg, history) => {
      // If discussing time/dates, likely calendar related
      const timeTerms = ['today', 'tomorrow', 'next week', 'monday', 'tuesday', 'wednesday',
                        'thursday', 'friday', 'saturday', 'sunday', 'am', 'pm']
      return timeTerms.some(term => msg.toLowerCase().includes(term))
    },
    priority: 9
  },

  // Perplexity - Research and current information
  {
    integrationId: 'perplexity',
    keywords: ['research', 'look up', 'find information', 'tell me about', 'what is', 'who is'],
    patterns: [
      /research/i,
      /look\s+up/i,
      /(find|get)\s+information\s+about/i,
      /tell\s+me\s+about/i,
      /what\s+(is|are)\s+the\s+latest/i,
      /current\s+(news|information)/i,
      /how\s+does\s+.*\s+work/i
    ],
    contextual: (msg, history) => {
      // Perplexity for complex, open-ended research questions
      const isQuestion = /\?/.test(msg) ||
                        /^(what|who|when|where|why|how|is|are|can|could|should)/i.test(msg)
      const isLong = msg.split(' ').length > 10
      return isQuestion && isLong
    },
    priority: 7
  },

  // Brave Search - Web search
  {
    integrationId: 'brave',
    keywords: ['search', 'google', 'find', 'web search'],
    patterns: [
      /search\s+(for|about|the\s+web)/i,
      /google\s+(for|this)/i,
      /(find|search)\s+on\s+(the\s+)?(web|internet)/i,
      /look\s+online/i
    ],
    contextual: (msg, history) => {
      // Brave for quick web searches
      const searchTerms = ['search', 'find', 'google']
      return searchTerms.some(term => msg.toLowerCase().includes(term))
    },
    priority: 8
  },

  // Playwright - Browser automation
  {
    integrationId: 'playwright',
    keywords: ['browser', 'navigate', 'website', 'screenshot', 'automate', 'web page'],
    patterns: [
      /open\s+(a\s+)?browser/i,
      /navigate\s+to/i,
      /take\s+(a\s+)?screenshot/i,
      /test\s+(the\s+)?website/i,
      /visit\s+the\s+website/i,
      /go\s+to\s+(the\s+)?(website|page)/i,
      /browser\s+automation/i
    ],
    contextual: (msg, history) => {
      // Check for URLs in message
      return /https?:\/\//.test(msg)
    },
    priority: 6
  },

  // Vercel - Deployment
  {
    integrationId: 'vercel',
    keywords: ['deploy', 'vercel', 'deployment', 'hosting', 'production'],
    patterns: [
      /deploy\s+(to\s+)?vercel/i,
      /vercel\s+deploy/i,
      /push\s+to\s+production/i,
      /deploy\s+(the\s+)?(app|site|website)/i
    ],
    contextual: (msg, history) => false,
    priority: 5
  },

  // BrowserBase - Cloud browser
  {
    integrationId: 'browserbase',
    keywords: ['browserbase', 'cloud browser', 'remote browser'],
    patterns: [
      /browserbase/i,
      /cloud\s+browser/i,
      /remote\s+browser/i
    ],
    contextual: (msg, history) => false,
    priority: 4
  },

  // Context7 - Code search
  {
    integrationId: 'context7',
    keywords: ['context7', 'code search'],
    patterns: [
      /context7/i,
      /search\s+(the\s+)?codebase/i
    ],
    contextual: (msg, history) => false,
    priority: 4
  },

  // Nano Banana - Media
  {
    integrationId: 'nano-banana',
    keywords: ['nano banana', 'media', 'video', 'audio'],
    patterns: [
      /nano\s+banana/i
    ],
    contextual: (msg, history) => false,
    priority: 3
  },

  // Gemini - AI capabilities
  {
    integrationId: 'gemini',
    keywords: ['gemini', 'generate image', 'create image'],
    patterns: [
      /gemini/i,
      /generate\s+(an?\s+)?image/i,
      /create\s+(an?\s+)?image/i
    ],
    contextual: (msg, history) => false,
    priority: 4
  }
]

/**
 * Detects which integrations are needed based on user message using heuristic patterns
 * @param message - The user's message
 * @param conversationHistory - Recent conversation history for context
 * @param enabledIntegrations - List of integration IDs that are currently enabled
 * @returns Array of intent matches sorted by confidence (highest first)
 */
export function detectIntent(
  message: string,
  conversationHistory: Message[],
  enabledIntegrations: string[]
): IntentMatch[] {
  const matches: IntentMatch[] = []
  const lowerMessage = message.toLowerCase()

  // Check each pattern in priority order
  for (const pattern of INTENT_PATTERNS.sort((a, b) => b.priority - a.priority)) {
    // Skip if integration not enabled
    if (!enabledIntegrations.includes(pattern.integrationId)) {
      continue
    }

    let confidence = 0
    let trigger = ''

    // Keyword matching (each keyword adds to confidence)
    const keywordMatches = pattern.keywords.filter(kw =>
      lowerMessage.includes(kw.toLowerCase())
    )
    if (keywordMatches.length > 0) {
      confidence += 0.3 * keywordMatches.length
      trigger = `keywords: ${keywordMatches.join(', ')}`
    }

    // Pattern matching (strong signal)
    let patternMatched = false
    for (const regex of pattern.patterns) {
      if (regex.test(message)) {
        confidence += 0.6
        trigger = trigger
          ? `${trigger} + pattern: ${regex.source.substring(0, 30)}...`
          : `pattern: ${regex.source.substring(0, 30)}...`
        patternMatched = true
        break
      }
    }

    // Contextual check (bonus signal)
    if (pattern.contextual(message, conversationHistory)) {
      confidence += 0.2
      trigger += ' + context'
    }

    // Cap at 1.0
    confidence = Math.min(confidence, 1.0)

    // Threshold for consideration (30% minimum)
    if (confidence > 0.3) {
      matches.push({
        integrationId: pattern.integrationId,
        confidence,
        trigger
      })
    }
  }

  // Return sorted by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Extracts integration ID from a tool name (e.g., "gmail_list_messages" -> "gmail")
 */
export function extractIntegrationId(toolName: string): string | null {
  const prefixes = [
    'gmail_',
    'calendar_',
    'brave_',
    'perplexity_',
    'playwright_',
    'vercel_',
    'browserbase_',
    'context7_',
    'nano-banana_',
    'gemini_'
  ]

  for (const prefix of prefixes) {
    if (toolName.startsWith(prefix)) {
      return prefix.slice(0, -1) // Remove trailing underscore
    }
  }

  return null
}
