import { PromptShortcut } from '@/types/shortcut'

/**
 * Shortcut Parser Service
 * Handles detection and completion of slash commands in chat input
 */

// Regex to match a partial command at the end of input (e.g., "/mor", "/check-")
const PARTIAL_COMMAND_REGEX = /\/[\w-]*$/

/**
 * Check if the input ends with a partial slash command
 * @param text The input text
 * @returns The partial command (including /) or null if no command is being typed
 */
export function getPartialCommand(text: string): string | null {
  const match = text.match(PARTIAL_COMMAND_REGEX)
  return match ? match[0] : null
}

/**
 * Get filtered suggestions for a partial command
 * @param partial The partial command (e.g., "/mor" or "/")
 * @param shortcuts All available shortcuts
 * @returns Filtered and sorted shortcuts that match the partial
 */
export function getCommandSuggestions(
  partial: string,
  shortcuts: PromptShortcut[]
): PromptShortcut[] {
  // Remove the leading slash for matching
  const search = partial.slice(1).toLowerCase()

  // If just "/", return all shortcuts
  if (!search) {
    return shortcuts.sort((a, b) => a.name.localeCompare(b.name))
  }

  // Filter shortcuts where name starts with or contains the search term
  return shortcuts
    .filter(s => s.name.toLowerCase().includes(search))
    .sort((a, b) => {
      // Prioritize shortcuts that start with the search term
      const aStarts = a.name.toLowerCase().startsWith(search)
      const bStarts = b.name.toLowerCase().startsWith(search)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      // Then sort alphabetically
      return a.name.localeCompare(b.name)
    })
}

/**
 * Complete a partial command by replacing it with the shortcut's prompt
 * @param text The current input text
 * @param shortcut The selected shortcut
 * @returns The text with the command replaced by the prompt
 */
export function completeCommand(text: string, shortcut: PromptShortcut): string {
  // Replace the partial command with the full prompt
  return text.replace(PARTIAL_COMMAND_REGEX, shortcut.prompt)
}

/**
 * Check if a command name is valid (no special chars except hyphens)
 * @param name The command name to validate
 * @returns true if valid
 */
export function isValidCommandName(name: string): boolean {
  return /^[\w-]+$/.test(name) && name.length > 0 && name.length <= 30
}
