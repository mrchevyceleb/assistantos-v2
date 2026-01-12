/**
 * Memory Retrieval Service
 *
 * Retrieves and ranks relevant memories for injection into system prompts.
 * Uses keyword-based retrieval with optional embedding support.
 */

import type { MemoryContext } from '../systemPrompt'

/**
 * Token budget configuration for memory injection
 */
export interface TokenBudget {
  profile: number      // ~400 tokens
  facts: number        // ~300 tokens
  preferences: number  // ~100 tokens
  summaries: number    // ~200 tokens
  total: number        // ~1000 tokens max
}

/**
 * Default token budgets
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  profile: 400,
  facts: 300,
  preferences: 100,
  summaries: 200,
  total: 1000,
}

/**
 * Estimate tokens in a string (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Extract keywords from a query for search
 */
export function extractQueryKeywords(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
    'help', 'me', 'my', 'please', 'want', 'need', 'like', 'would',
  ])

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
}

/**
 * Score how relevant a fact is to a query
 */
function scoreFact(
  fact: { fact: string; keywords?: string[]; confidence: number },
  queryKeywords: string[]
): number {
  if (queryKeywords.length === 0) return fact.confidence * 0.5

  const factKeywords = new Set(fact.keywords || extractQueryKeywords(fact.fact))
  let matches = 0
  for (const keyword of queryKeywords) {
    if (factKeywords.has(keyword)) matches++
  }

  const keywordScore = matches / Math.max(queryKeywords.length, 1)
  return (keywordScore * 0.6 + fact.confidence * 0.4)
}

/**
 * Score how relevant a summary is to a query
 */
function scoreSummary(
  summary: { summary: string; keywords?: string[]; title: string },
  queryKeywords: string[]
): number {
  if (queryKeywords.length === 0) return 0.5

  const summaryKeywords = new Set(summary.keywords || extractQueryKeywords(summary.summary + ' ' + summary.title))
  let matches = 0
  for (const keyword of queryKeywords) {
    if (summaryKeywords.has(keyword)) matches++
  }

  return matches / Math.max(queryKeywords.length, 1)
}

/**
 * Get relevant memories for a user message
 * This is the main retrieval function called before sending messages to Claude
 */
export async function getRelevantMemories(
  userMessage: string,
  workspacePath: string | null,
  budget: TokenBudget = DEFAULT_TOKEN_BUDGET
): Promise<MemoryContext | null> {
  try {
    // Check if memory service is available
    if (!window.electronAPI?.memory) {
      return null
    }

    // Check if memory is initialized
    const status = await window.electronAPI.memory.getStatus()
    if (!status.connected) {
      return null
    }

    const queryKeywords = extractQueryKeywords(userMessage)

    // Fetch all data in parallel
    const [profile, allFacts, allPreferences, allSummaries] = await Promise.all([
      window.electronAPI.memory.getProfile(),
      window.electronAPI.memory.getFacts(),
      window.electronAPI.memory.getPreferences(),
      window.electronAPI.memory.getSummaries(workspacePath || undefined),
    ])

    // Build memory context with token budget management
    const memoryContext: MemoryContext = {
      profile: null,
      facts: [],
      preferences: [],
      summaries: [],
    }

    let usedTokens = 0

    // 1. Profile (always include if available, ~400 tokens budget)
    if (profile) {
      const profileText = [
        profile.name,
        profile.role,
        profile.company,
        profile.tech_stack?.join(', '),
        profile.key_projects?.join(', '),
        profile.profile_summary,
        profile.communication_style,
      ].filter(Boolean).join(' ')

      const profileTokens = estimateTokens(profileText)
      if (profileTokens <= budget.profile) {
        memoryContext.profile = {
          name: profile.name,
          role: profile.role,
          company: profile.company,
          tech_stack: profile.tech_stack,
          key_projects: profile.key_projects,
          profile_summary: profile.profile_summary,
          communication_style: profile.communication_style,
        }
        usedTokens += profileTokens
      }
    }

    // 2. Facts - score and select top relevant (within ~300 token budget)
    if (allFacts && allFacts.length > 0) {
      const scoredFacts = allFacts
        .map(f => ({
          ...f,
          score: scoreFact(f, queryKeywords),
        }))
        .filter(f => f.score > 0.2) // Filter low relevance
        .sort((a, b) => b.score - a.score)

      let factTokens = 0
      for (const fact of scoredFacts) {
        const tokenEstimate = estimateTokens(fact.fact + fact.category)
        if (factTokens + tokenEstimate > budget.facts) break

        memoryContext.facts.push({
          category: fact.category,
          fact: fact.fact,
          confidence: fact.confidence,
        })
        factTokens += tokenEstimate
        usedTokens += tokenEstimate
      }
    }

    // 3. Preferences - include high confidence ones (~100 token budget)
    if (allPreferences && allPreferences.length > 0) {
      const activePrefs = allPreferences
        .filter(p => p.confidence >= 0.5)
        .sort((a, b) => b.confidence - a.confidence)

      let prefTokens = 0
      for (const pref of activePrefs) {
        const valueStr = typeof pref.preference_value === 'object'
          ? JSON.stringify(pref.preference_value)
          : String(pref.preference_value)
        const tokenEstimate = estimateTokens(pref.domain + pref.preference_key + valueStr)
        if (prefTokens + tokenEstimate > budget.preferences) break

        memoryContext.preferences.push({
          domain: pref.domain,
          preference_key: pref.preference_key,
          preference_value: pref.preference_value,
          confidence: pref.confidence,
        })
        prefTokens += tokenEstimate
        usedTokens += tokenEstimate
      }
    }

    // 4. Summaries - score and select relevant (~200 token budget)
    if (allSummaries && allSummaries.length > 0) {
      const scoredSummaries = allSummaries
        .map(s => ({
          ...s,
          score: scoreSummary(s, queryKeywords),
        }))
        .filter(s => s.score > 0.1) // Filter low relevance
        .sort((a, b) => b.score - a.score)

      let summaryTokens = 0
      for (const summary of scoredSummaries.slice(0, 3)) { // Max 3 summaries
        const tokenEstimate = estimateTokens(summary.title + summary.summary)
        if (summaryTokens + tokenEstimate > budget.summaries) break

        memoryContext.summaries.push({
          title: summary.title,
          summary: summary.summary,
          workspace_path: summary.workspace_path,
        })
        summaryTokens += tokenEstimate
        usedTokens += tokenEstimate
      }
    }

    // Check if we have any meaningful content
    const hasContent =
      memoryContext.profile !== null ||
      memoryContext.facts.length > 0 ||
      memoryContext.preferences.length > 0 ||
      memoryContext.summaries.length > 0

    if (!hasContent) {
      return null
    }

    console.log(`Memory: Retrieved ${memoryContext.facts.length} facts, ${memoryContext.preferences.length} preferences, ${memoryContext.summaries.length} summaries (~${usedTokens} tokens)`)

    return memoryContext
  } catch (error) {
    console.error('Failed to retrieve memories:', error)
    return null
  }
}

/**
 * Check if a message is trivial (doesn't need memory injection)
 */
export function isTrivialMessage(message: string): boolean {
  const trivialPatterns = [
    /^(hi|hello|hey|yo|sup)[\s!.,]*$/i,
    /^(thanks|thank you|thx|ty)[\s!.,]*$/i,
    /^(ok|okay|sure|yes|no|yeah|yep|nope)[\s!.,]*$/i,
    /^(bye|goodbye|see ya|later)[\s!.,]*$/i,
    /^(good|great|nice|awesome|cool)[\s!.,]*$/i,
  ]

  const trimmed = message.trim()
  if (trimmed.length < 10) {
    return trivialPatterns.some(p => p.test(trimmed))
  }

  return false
}
