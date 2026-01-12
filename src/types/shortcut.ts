export interface PromptShortcut {
  id: string
  name: string           // e.g., "intake" (without the /)
  prompt: string         // The actual prompt text
  description: string    // For display in autocomplete and settings
  isBuiltIn?: boolean    // true for default shortcuts (can't delete, only edit)
}

export const DEFAULT_SHORTCUTS: PromptShortcut[] = [
  {
    id: 'builtin-intake',
    name: 'intake',
    description: 'Process and organize inbox items',
    prompt: 'Help me process and organize new items in my inbox. Look through any files or messages marked for processing and suggest where to file them or what actions to take.',
    isBuiltIn: true
  },
  {
    id: 'builtin-morning',
    name: 'morning',
    description: 'Get a morning briefing',
    prompt: 'Give me a morning briefing: check my calendar for today using @calendar, summarize any important emails using @gmail, and list my top priority tasks from the TASKS folder.',
    isBuiltIn: true
  },
  {
    id: 'builtin-check-email',
    name: 'check-email',
    description: 'Summarize important emails',
    prompt: 'Check my email using @gmail and summarize any important or urgent messages that need my attention.',
    isBuiltIn: true
  },
  {
    id: 'builtin-check-calendar',
    name: 'check-calendar',
    description: 'Show upcoming calendar events',
    prompt: 'Check my calendar using @calendar and tell me what\'s coming up today and tomorrow.',
    isBuiltIn: true
  },
  {
    id: 'builtin-research',
    name: 'research',
    description: 'Research a topic',
    prompt: 'Help me research a topic. I\'ll provide the subject and you\'ll search the web, gather information, and present a comprehensive summary.',
    isBuiltIn: true
  },
  {
    id: 'builtin-compact',
    name: 'compact',
    description: 'Compress conversation history to save context',
    prompt: 'Please compact my conversation history by summarizing older messages while preserving recent context and important decisions. Create a concise summary that captures key information, decisions made, and ongoing tasks so we can continue our work efficiently.',
    isBuiltIn: true
  }
]
