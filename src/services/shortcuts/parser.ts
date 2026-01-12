import { PromptShortcut, ParsedCommand } from '@/types/shortcut'

/**
 * Shortcut Parser Service
 * Handles detection and completion of slash commands in chat input
 *
 * Enhanced to support Claude Code style commands with arguments:
 *   /research AI trends 2025        -> expands with $ARGUMENTS = "AI trends 2025"
 *   /draft email to client          -> expands with $ARGUMENTS = "email to client"
 *   /morning                         -> expands without arguments
 */

// Regex to match a partial command at the end of input (e.g., "/mor", "/check-")
const PARTIAL_COMMAND_REGEX = /\/[\w-]*$/

// Placeholder markers for argument substitution
const ARGUMENTS_PLACEHOLDER = '$ARGUMENTS'
const ARGUMENTS_SECTION_PLACEHOLDER = '$ARGUMENTS_SECTION'

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
 * Complete a partial command from autocomplete
 *
 * If the shortcut expects arguments, inserts just the command name with a trailing space,
 * allowing the user to type arguments before sending.
 *
 * If no arguments expected, inserts the full prompt directly.
 *
 * @param text The current input text
 * @param shortcut The selected shortcut
 * @returns The text with the command completed
 */
export function completeCommand(text: string, shortcut: PromptShortcut): string {
  const expectsArgs = shortcut.argumentHint ||
    shortcut.prompt.includes('$ARGUMENTS') ||
    shortcut.prompt.includes('$ARGUMENTS_SECTION')

  if (expectsArgs) {
    // For commands that accept arguments, insert command name + space
    // User can then type arguments before pressing Enter
    return text.replace(PARTIAL_COMMAND_REGEX, `/${shortcut.name} `)
  }

  // For commands without arguments, expand to full prompt immediately
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

/**
 * Parse a slash command into its components
 * @param text The input text starting with /
 * @returns ParsedCommand with name and arguments, or null if not a command
 */
export function parseSlashCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim()

  if (!trimmed.startsWith('/')) {
    return null
  }

  // Extract the command name (first word after /)
  const match = trimmed.match(/^\/(\S+)/)
  if (!match) {
    return null
  }

  const commandName = match[1].toLowerCase()
  const arguments_ = trimmed.slice(match[0].length).trim()

  return {
    name: commandName,
    arguments: arguments_,
    rawInput: text
  }
}

/**
 * Substitute argument placeholders in a prompt template
 * @param template The prompt template with placeholders
 * @param arguments_ The arguments to substitute
 * @returns The expanded prompt with arguments substituted
 */
export function substituteArguments(template: string, arguments_: string): string {
  let result = template

  // Handle $ARGUMENTS placeholder - direct substitution
  if (result.includes(ARGUMENTS_PLACEHOLDER)) {
    result = result.replace(ARGUMENTS_PLACEHOLDER, arguments_ || '')
  }

  // Handle $ARGUMENTS_SECTION placeholder - only add section if arguments exist
  if (result.includes(ARGUMENTS_SECTION_PLACEHOLDER)) {
    if (arguments_) {
      result = result.replace(ARGUMENTS_SECTION_PLACEHOLDER, `\n\nAdditional context: ${arguments_}`)
    } else {
      result = result.replace(ARGUMENTS_SECTION_PLACEHOLDER, '')
    }
  }

  return result.trim()
}

/**
 * Check if a shortcut expects arguments (has an argumentHint or uses $ARGUMENTS placeholder)
 * @param shortcut The shortcut to check
 * @returns true if the shortcut expects arguments
 */
export function shortcutExpectsArguments(shortcut: PromptShortcut): boolean {
  return !!(
    shortcut.argumentHint ||
    shortcut.prompt.includes(ARGUMENTS_PLACEHOLDER) ||
    shortcut.prompt.includes(ARGUMENTS_SECTION_PLACEHOLDER)
  )
}

/**
 * Check if a shortcut requires arguments (has $ARGUMENTS in prompt, not $ARGUMENTS_SECTION)
 * @param shortcut The shortcut to check
 * @returns true if the shortcut requires arguments
 */
export function shortcutRequiresArguments(shortcut: PromptShortcut): boolean {
  // Required if it uses $ARGUMENTS directly (not the optional SECTION variant)
  // and doesn't have a fallback in the argumentHint (indicated by brackets)
  const usesDirectPlaceholder = shortcut.prompt.includes(ARGUMENTS_PLACEHOLDER) &&
    !shortcut.prompt.includes(ARGUMENTS_SECTION_PLACEHOLDER)
  const hintIsOptional = shortcut.argumentHint?.startsWith('[')

  return usesDirectPlaceholder && !hintIsOptional
}

/**
 * Expand a slash command if the input matches a known shortcut
 * Handles both exact matches ("/morning") and commands with arguments ("/research AI trends")
 *
 * Arguments are handled via placeholders in the prompt:
 *   $ARGUMENTS - replaced with the arguments directly
 *   $ARGUMENTS_SECTION - replaced with "\n\nAdditional context: {args}" if args exist, empty otherwise
 *
 * @param text The input text
 * @param shortcuts All available shortcuts
 * @returns The expanded text with command replaced by prompt, or original text if no match
 */
export function expandSlashCommand(text: string, shortcuts: PromptShortcut[]): string {
  const parsed = parseSlashCommand(text)
  if (!parsed) {
    return text
  }

  // Find a matching shortcut
  const shortcut = shortcuts.find(s => s.name.toLowerCase() === parsed.name)
  if (!shortcut) {
    return text
  }

  // Check if arguments are required but not provided
  if (shortcutRequiresArguments(shortcut) && !parsed.arguments) {
    // Return original text - the UI should prompt for arguments
    console.log(`[Shortcuts] Command /${shortcut.name} requires arguments but none provided`)
    return text
  }

  // Substitute arguments in the prompt
  const expandedPrompt = substituteArguments(shortcut.prompt, parsed.arguments)

  // Log the expansion for debugging
  if (parsed.arguments) {
    console.log(`[Shortcuts] Expanded /${parsed.name} with args: "${parsed.arguments.substring(0, 50)}..."`)
  } else {
    console.log(`[Shortcuts] Expanded /${parsed.name} without args`)
  }

  return expandedPrompt
}

/**
 * Get a formatted display string for a shortcut showing its argument hint
 * @param shortcut The shortcut
 * @returns Formatted string like "/research TOPIC" or "/morning"
 */
export function getShortcutDisplayName(shortcut: PromptShortcut): string {
  if (shortcut.argumentHint) {
    return `/${shortcut.name} ${shortcut.argumentHint}`
  }
  return `/${shortcut.name}`
}
