/**
 * Memory Extraction Service
 *
 * Extracts facts, preferences, and summaries from conversations.
 * Uses both rule-based patterns and optional AI extraction.
 */

import type { UserFact, UserPreference, ConversationSummary } from './types'

/**
 * Patterns for extracting different types of facts from user messages
 */
const FACT_PATTERNS = {
  // Personal facts
  personal: [
    { pattern: /my name is (\w+)/i, category: 'personal', template: 'User\'s name is $1' },
    { pattern: /i'?m called (\w+)/i, category: 'personal', template: 'User\'s name is $1' },
    { pattern: /i live in ([^,.\n]+)/i, category: 'personal', template: 'Lives in $1' },
    { pattern: /i'?m (\d+) years old/i, category: 'personal', template: 'Is $1 years old' },
    { pattern: /i'?m from ([^,.\n]+)/i, category: 'personal', template: 'Is from $1' },
  ],

  // Work/professional facts
  work: [
    { pattern: /i work (?:at|for) ([^,.\n]+)/i, category: 'work', template: 'Works at $1' },
    { pattern: /i'?m a ([^,.\n]+) (?:at|for|working)/i, category: 'work', template: 'Role is $1' },
    { pattern: /my job is ([^,.\n]+)/i, category: 'work', template: 'Job is $1' },
    { pattern: /i'?m the ([^,.\n]+) (?:at|of|for)/i, category: 'work', template: 'Position is $1' },
    { pattern: /my title is ([^,.\n]+)/i, category: 'work', template: 'Title is $1' },
    { pattern: /my company is ([^,.\n]+)/i, category: 'work', template: 'Company is $1' },
    { pattern: /i lead (?:the )?([^,.\n]+) team/i, category: 'work', template: 'Leads $1 team' },
  ],

  // Project/technical facts
  project: [
    { pattern: /(?:we|i) use ([^,.\n]+) for (?:our |the )?([^,.\n]+)/i, category: 'project', template: 'Uses $1 for $2' },
    { pattern: /our (?:stack|tech stack) (?:is|includes) ([^,.\n]+)/i, category: 'project', template: 'Tech stack includes $1' },
    { pattern: /(?:i'?m|we'?re) building ([^,.\n]+)/i, category: 'project', template: 'Building $1' },
    { pattern: /(?:i'?m|we'?re) working on ([^,.\n]+)/i, category: 'project', template: 'Working on $1' },
    { pattern: /the project (?:is|uses) ([^,.\n]+)/i, category: 'project', template: 'Project uses $1' },
    { pattern: /we deploy (?:to|on|with) ([^,.\n]+)/i, category: 'project', template: 'Deploys to $1' },
  ],

  // Preference facts (explicit statements)
  preference: [
    { pattern: /i prefer ([^,.\n]+) (?:over|to|instead)/i, category: 'preference', template: 'Prefers $1' },
    { pattern: /i (?:like|love) using ([^,.\n]+)/i, category: 'preference', template: 'Likes using $1' },
    { pattern: /i (?:don'?t like|hate|avoid) ([^,.\n]+)/i, category: 'preference', template: 'Dislikes $1' },
    { pattern: /i always ([^,.\n]+)/i, category: 'preference', template: 'Always $1' },
    { pattern: /i never ([^,.\n]+)/i, category: 'preference', template: 'Never $1' },
  ],
}

/**
 * Extract potential facts from a user message using pattern matching
 */
export function extractFactsFromMessage(message: string): Omit<UserFact, 'id' | 'user_id' | 'created_at'>[] {
  const facts: Omit<UserFact, 'id' | 'user_id' | 'created_at'>[] = []
  const seenFacts = new Set<string>()

  for (const [_type, patterns] of Object.entries(FACT_PATTERNS)) {
    for (const { pattern, category, template } of patterns) {
      const match = message.match(pattern)
      if (match) {
        // Build the fact string from template
        let fact = template
        for (let i = 1; i < match.length; i++) {
          fact = fact.replace(`$${i}`, match[i].trim())
        }

        // Deduplicate
        const key = `${category}:${fact.toLowerCase()}`
        if (!seenFacts.has(key)) {
          seenFacts.add(key)
          facts.push({
            category,
            fact,
            source: 'conversation',
            confidence: 0.8, // Pattern-matched facts have good confidence
          })
        }
      }
    }
  }

  return facts
}

/**
 * Preference patterns for learning user behavior
 */
const PREFERENCE_PATTERNS = [
  // Code style preferences
  { pattern: /(?:use|prefer|like) (tabs|spaces) (?:for|in|when)/i, domain: 'code_style', key: 'indentation', valueExtract: 1 },
  { pattern: /(?:use|prefer) (single|double) quotes/i, domain: 'code_style', key: 'quotes', valueExtract: 1 },
  { pattern: /(?:prefer|like|use) (camelCase|snake_case|PascalCase|kebab-case)/i, domain: 'code_style', key: 'naming_convention', valueExtract: 1 },

  // Communication preferences
  { pattern: /(?:keep it|be) (brief|concise|detailed|verbose)/i, domain: 'communication', key: 'verbosity', valueExtract: 1 },
  { pattern: /(?:don'?t|no) (?:need to )?explain/i, domain: 'communication', key: 'skip_explanations', value: true },
  { pattern: /explain (?:everything|in detail|more)/i, domain: 'communication', key: 'detailed_explanations', value: true },

  // Tool/framework preferences
  { pattern: /(?:prefer|use|like) (npm|yarn|pnpm|bun)/i, domain: 'tools', key: 'package_manager', valueExtract: 1 },
  { pattern: /(?:prefer|use) (vim|neovim|vscode|cursor)/i, domain: 'tools', key: 'editor', valueExtract: 1 },
]

/**
 * Extract preferences from user messages
 */
export function extractPreferencesFromMessage(message: string): Omit<UserPreference, 'id' | 'user_id' | 'updated_at'>[] {
  const preferences: Omit<UserPreference, 'id' | 'user_id' | 'updated_at'>[] = []
  const seenPrefs = new Set<string>()

  for (const { pattern, domain, key, value, valueExtract } of PREFERENCE_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      const prefValue = value !== undefined ? value : (valueExtract !== undefined ? match[valueExtract].toLowerCase() : true)

      const prefKey = `${domain}:${key}`
      if (!seenPrefs.has(prefKey)) {
        seenPrefs.add(prefKey)
        preferences.push({
          domain,
          preference_key: key,
          preference_value: prefValue,
          confidence: 0.7,
        })
      }
    }
  }

  return preferences
}

/**
 * Message content for summarization
 */
interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Generate a summary of a conversation
 * This is a simple extractive summary - can be enhanced with AI
 */
export function generateConversationSummary(
  messages: ConversationMessage[],
  title: string,
  workspacePath?: string | null
): Omit<ConversationSummary, 'id' | 'user_id' | 'created_at' | 'embedding'> {
  // Extract key points from the conversation
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content)
  const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content)

  // Get first user message as the main topic
  const mainTopic = userMessages[0]?.substring(0, 200) || ''

  // Count approximate outcomes
  const outcomePatterns = [
    /completed|done|finished|success|worked/i,
    /created|wrote|generated|built/i,
    /fixed|resolved|solved/i,
    /learned|understood|explained/i,
  ]

  const outcomes: string[] = []
  for (const msg of assistantMessages) {
    for (const pattern of outcomePatterns) {
      if (pattern.test(msg)) {
        // Extract a snippet around the match
        const match = msg.match(pattern)
        if (match && match.index !== undefined) {
          const start = Math.max(0, match.index - 20)
          const end = Math.min(msg.length, match.index + 50)
          outcomes.push(msg.substring(start, end).trim())
          break
        }
      }
    }
  }

  // Build summary
  const summaryParts: string[] = []

  if (mainTopic) {
    summaryParts.push(`Topic: ${mainTopic}`)
  }

  if (outcomes.length > 0) {
    summaryParts.push(`Outcomes: ${outcomes.slice(0, 3).join('; ')}`)
  }

  const summary = summaryParts.join('\n').substring(0, 1000)

  // Extract keywords for search
  const allText = messages.map(m => m.content).join(' ')
  const keywords = extractKeywords(allText)

  return {
    title,
    summary,
    workspace_path: workspacePath,
    key_decisions: [], // Could be enhanced to extract actual decisions
    keywords,
  }
}

/**
 * Extract keywords from text for search indexing
 */
function extractKeywords(text: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
  ])

  // Extract words, filter, and count frequency
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))

  const wordCount = new Map<string, number>()
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) || 0) + 1)
  }

  // Sort by frequency and take top keywords
  const sorted = [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word)

  return sorted
}

/**
 * Process a conversation for memory extraction
 * Returns all extracted memories ready for storage
 */
export function processConversationForMemory(
  messages: ConversationMessage[],
  conversationTitle: string,
  workspacePath?: string | null
): {
  facts: Omit<UserFact, 'id' | 'user_id' | 'created_at'>[]
  preferences: Omit<UserPreference, 'id' | 'user_id' | 'updated_at'>[]
  summary: Omit<ConversationSummary, 'id' | 'user_id' | 'created_at' | 'embedding'>
} {
  const facts: Omit<UserFact, 'id' | 'user_id' | 'created_at'>[] = []
  const preferences: Omit<UserPreference, 'id' | 'user_id' | 'updated_at'>[] = []
  const seenFacts = new Set<string>()
  const seenPrefs = new Set<string>()

  // Process each user message
  for (const msg of messages) {
    if (msg.role !== 'user') continue

    // Extract facts
    const newFacts = extractFactsFromMessage(msg.content)
    for (const fact of newFacts) {
      const key = `${fact.category}:${fact.fact.toLowerCase()}`
      if (!seenFacts.has(key)) {
        seenFacts.add(key)
        facts.push(fact)
      }
    }

    // Extract preferences
    const newPrefs = extractPreferencesFromMessage(msg.content)
    for (const pref of newPrefs) {
      const key = `${pref.domain}:${pref.preference_key}`
      if (!seenPrefs.has(key)) {
        seenPrefs.add(key)
        preferences.push(pref)
      }
    }
  }

  // Generate conversation summary
  const summary = generateConversationSummary(messages, conversationTitle, workspacePath)

  return { facts, preferences, summary }
}
