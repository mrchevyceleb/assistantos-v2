/**
 * PromptShortcut - Claude Code style command/skill definition
 *
 * Commands can now accept arguments after the command name, similar to Claude Code skills.
 * Arguments are passed to the prompt via placeholder substitution.
 *
 * Example usage:
 *   /research AI trends 2025
 *   /commit -m "Fix bug"
 *   /bigtest https://myapp.com
 */
export interface PromptShortcut {
  id: string
  name: string           // e.g., "intake" (without the /)
  prompt: string         // The actual prompt text - can contain $ARGUMENTS placeholder
  description: string    // For display in autocomplete and settings
  isBuiltIn?: boolean    // true for default shortcuts (can't delete, only edit)

  // Enhanced properties (Claude Code style)
  argumentHint?: string           // Shows what arguments are expected (e.g., "TOPIC", "URL [--option]")
  allowedTools?: string[]         // Optional: restrict which tools can be used (future use)
  triggers?: string[]             // Optional: keywords that can auto-activate this command (future use)
}

/**
 * ParsedCommand - Result of parsing a slash command with arguments
 */
export interface ParsedCommand {
  name: string           // The command name (without /)
  arguments: string      // Everything after the command name
  rawInput: string       // The original full input
}

export const DEFAULT_SHORTCUTS: PromptShortcut[] = [
  {
    id: 'builtin-intake',
    name: 'intake',
    description: 'Process and organize inbox items',
    prompt: 'Help me process and organize new items in my inbox. Look through any files or messages marked for processing and suggest where to file them or what actions to take.$ARGUMENTS_SECTION',
    isBuiltIn: true,
    argumentHint: '[folder or filter]'
  },
  {
    id: 'builtin-morning',
    name: 'morning',
    description: 'Get a morning briefing',
    prompt: 'Give me a morning briefing: check my calendar for today using @calendar, summarize any important emails using @gmail, and list my top priority tasks from the TASKS folder.$ARGUMENTS_SECTION',
    isBuiltIn: true
  },
  {
    id: 'builtin-check-email',
    name: 'check-email',
    description: 'Summarize important emails',
    prompt: 'Check my email using @gmail and summarize any important or urgent messages that need my attention.$ARGUMENTS_SECTION',
    isBuiltIn: true,
    argumentHint: '[search query]'
  },
  {
    id: 'builtin-check-calendar',
    name: 'check-calendar',
    description: 'Show upcoming calendar events',
    prompt: 'Check my calendar using @calendar and tell me what\'s coming up today and tomorrow.$ARGUMENTS_SECTION',
    isBuiltIn: true,
    argumentHint: '[date range]'
  },
  {
    id: 'builtin-research',
    name: 'research',
    description: 'Research a topic using web search',
    prompt: 'Research the following topic using @perplexity or web search. Gather comprehensive information and present a well-organized summary with key findings, sources, and actionable insights.\n\nTopic: $ARGUMENTS',
    isBuiltIn: true,
    argumentHint: 'TOPIC'
  },
  {
    id: 'builtin-compact',
    name: 'compact',
    description: 'Compress conversation history to save context',
    prompt: 'Please compact my conversation history by summarizing older messages while preserving recent context and important decisions. Create a concise summary that captures key information, decisions made, and ongoing tasks so we can continue our work efficiently.',
    isBuiltIn: true
  },
  {
    id: 'builtin-summarize',
    name: 'summarize',
    description: 'Summarize a document or URL',
    prompt: 'Please summarize the following content. Provide key points, main arguments, and a brief overview.\n\nContent: $ARGUMENTS',
    isBuiltIn: true,
    argumentHint: 'CONTENT or URL'
  },
  {
    id: 'builtin-explain',
    name: 'explain',
    description: 'Explain a concept or code',
    prompt: 'Please explain the following in clear, simple terms. Include examples where helpful.\n\nExplain: $ARGUMENTS',
    isBuiltIn: true,
    argumentHint: 'CONCEPT or CODE'
  },
  {
    id: 'builtin-draft',
    name: 'draft',
    description: 'Draft an email or message',
    prompt: 'Help me draft a professional message based on the following:\n\n$ARGUMENTS\n\nProvide a well-structured draft that I can review and edit.',
    isBuiltIn: true,
    argumentHint: 'MESSAGE DESCRIPTION'
  }
]
