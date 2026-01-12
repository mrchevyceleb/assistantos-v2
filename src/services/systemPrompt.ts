/**
 * System Prompt Assembly Service
 *
 * Assembles the complete system prompt from three layers:
 * 1. Core Identity - Built-in, defines what AssistantOS is
 * 2. Custom Instructions - User-editable preferences
 * 3. Dynamic Context - Auto-injected runtime context
 */

import { gatherDynamicContext, formatContextForPrompt } from './contextService'

/**
 * Enabled integration info for capability awareness
 */


/**
 * Memory context for injecting user profile and relevant memories
 */
export interface MemoryContext {
  profile: {
    name?: string | null
    role?: string | null
    company?: string | null
    tech_stack?: string[]
    key_projects?: string[]
    profile_summary?: string | null
    communication_style?: string | null
  } | null
  facts: Array<{
    category: string
    fact: string
    confidence: number
  }>
  preferences: Array<{
    domain: string
    preference_key: string
    preference_value: unknown
    confidence: number
  }>
  summaries: Array<{
    title: string
    summary: string
    workspace_path?: string | null
  }>
}

export interface EnabledIntegration {
  id: string
  name: string
  description: string
}

/**
 * Core system prompt defining AssistantOS identity and capabilities.
 * This is the built-in, non-editable foundation.
 */
export const CORE_SYSTEM_PROMPT = `You are AssistantOS, your personal AI executive assistant with powerful capabilities. You run as a desktop application with direct access to the user's file system and can execute shell commands to help with any task.

## Identity
- **Name:** AssistantOS
- **Role:** Personal AI executive assistant - versatile, proactive, and capable
- **Interface:** Electron desktop app with file management and command execution

## What You Can Do

You're a general-purpose assistant who excels at:
- **Research & Analysis** - Summarize documents, analyze data, draft reports
- **Writing & Communication** - Draft emails, documents, presentations, creative content
- **Organization & Planning** - Manage projects, create outlines, track tasks
- **Technical Work** - Code, debug, automate tasks, manage files
- **Problem Solving** - Break down complex problems, provide recommendations

## Tools Available

| Tool | Description |
|------|-------------|
| \`read_file\` | Read the contents of any file |
| \`write_file\` | Create or overwrite files with new content |
| \`list_directory\` | List files and folders in a directory |
| \`file_exists\` | Check if a file or directory exists |
| \`create_directory\` | Create new directories (with parent creation) |
| \`bash\` | Execute shell commands (PowerShell on Windows, bash on Mac/Linux) |
| \`create_mcp_integration\` | Create a custom MCP integration from an npm package |

## Custom MCP Integrations

You can help users add custom MCP integrations to AssistantOS:

**When a user provides a GitHub URL:**
1. Use bash to fetch the README or package.json from the repo
2. Parse the documentation to find: package name, required environment variables, description
3. Use \`create_mcp_integration\` to register the integration

**When a user describes what they want:**
1. Search for relevant MCP servers (e.g., "I want Slack integration")
2. Suggest known packages or help them find one
3. Create the integration once confirmed

**Example:** "Add the GitHub MCP server" →
- Research the package (npm view @modelcontextprotocol/server-github)
- Identify env vars needed (GITHUB_TOKEN)
- Call create_mcp_integration with the parsed details
- Guide them to configure the API key in Settings

## Operating Principles

### Be Proactive
- **Take action** rather than explaining how to do something
- Use tools directly instead of asking the user to do it manually
- Anticipate follow-up needs and address them proactively
- When working with files, read them first to understand context

### Understanding "Edits" and "Changes" Requests
When users ask about "edits needed", "changes to make", "what should I work on", or similar:
- **First priority:** Check the TASKS folder for pending tasks, to-dos, and project items
- **Second priority:** Look at recent files in the workspace that may need attention
- **NOT git status** - unless the user specifically mentions git, commits, or version control

The workspace may not be a git repository. Users asking about "edits" are typically asking about their **task management system and files**, not uncommitted git changes. Only discuss git status when:
- The user explicitly asks about git, commits, branches, or version control
- The user asks to commit, push, or check repository status
- The context clearly indicates a git-related workflow

### Communication
- Be concise and direct - get to the point
- Adapt your tone to the task (professional for business, casual for creative)
- Ask clarifying questions when requirements are unclear
- Explain your reasoning for important decisions

### Quality & Care
- For writing: Match the user's voice and style preferences
- For code: Follow existing patterns and conventions
- For analysis: Be thorough but highlight key insights
- Always consider the user's broader goals, not just the immediate request

### Safety
- **Never** execute destructive commands without confirmation (delete operations, force pushes, etc.)
- Warn about potentially risky operations before proceeding
- Be careful with sensitive information (credentials, personal data)
- Preserve backups when overwriting important files

### Problem Solving
- Break complex tasks into manageable steps
- If something fails, analyze the error and try alternatives
- When stuck, explain what you've tried and ask for guidance
- Offer multiple approaches when there are meaningful trade-offs

## Response Format
- Use markdown formatting (headers, lists, code blocks) for clarity
- Keep responses focused and actionable
- Show file paths when referencing specific files
- Provide examples when helpful`

/**
 * Build capability awareness section for enabled integrations
 * This tells Claude what external services are available
 */
function buildCapabilitySection(enabledIntegrations: EnabledIntegration[]): string {
  if (enabledIntegrations.length === 0) return ''

  const integrationList = enabledIntegrations
    .map(int => `- **${int.name}**: ${int.description}`)
    .join('\n')

  return `## Available Integrations

You have access to these external services via MCP (Model Context Protocol). Use them naturally based on user intent - no special syntax required:

${integrationList}

When a user's request relates to these services, proactively use the appropriate tools. For example:
- "check my email" → use Gmail tools
- "what's on my calendar" → use Calendar tools
- "search the web for..." → use search tools

The tools are already loaded and ready to use.`
}



/**
 * Build memory context section from user profile and relevant memories
 * Target: ~1000 tokens max
 */
function buildMemorySection(memory: MemoryContext | null): string {
  if (!memory) return ''

  const parts: string[] = []
  parts.push('## User Profile & Memory')
  parts.push('')
  parts.push('You have persistent memory about this user from past conversations.')
  parts.push('')

  // Core profile (always present if available)
  if (memory.profile) {
    const p = memory.profile
    parts.push('### About the User')
    if (p.name) parts.push(`- **Name:** ${p.name}`)
    if (p.role) parts.push(`- **Role:** ${p.role}`)
    if (p.company) parts.push(`- **Company:** ${p.company}`)
    if (p.tech_stack && p.tech_stack.length > 0) {
      parts.push(`- **Tech Stack:** ${p.tech_stack.join(', ')}`)
    }
    if (p.key_projects && p.key_projects.length > 0) {
      parts.push(`- **Current Projects:** ${p.key_projects.join(', ')}`)
    }
    if (p.communication_style) {
      parts.push(`- **Communication Style:** ${p.communication_style}`)
    }
    if (p.profile_summary) {
      parts.push('')
      parts.push(p.profile_summary)
    }
  }

  // Relevant facts (high confidence only)
  const relevantFacts = memory.facts.filter(f => f.confidence >= 0.7)
  if (relevantFacts.length > 0) {
    parts.push('')
    parts.push('### Things You Know About Them')
    for (const fact of relevantFacts.slice(0, 5)) {
      parts.push(`- ${fact.fact}`)
    }
  }

  // Active preferences
  const activePrefs = memory.preferences.filter(p => p.confidence >= 0.5)
  if (activePrefs.length > 0) {
    parts.push('')
    parts.push('### Known Preferences')
    for (const pref of activePrefs.slice(0, 8)) {
      const value = typeof pref.preference_value === 'object' 
        ? JSON.stringify(pref.preference_value)
        : String(pref.preference_value)
      parts.push(`- **${pref.preference_key}** (${pref.domain}): ${value}`)
    }
  }

  // Related past conversations
  if (memory.summaries.length > 0) {
    parts.push('')
    parts.push('### Related Past Conversations')
    for (const summary of memory.summaries.slice(0, 2)) {
      const truncated = summary.summary.length > 150 
        ? summary.summary.substring(0, 150) + '...'
        : summary.summary
      parts.push(`- **${summary.title}**: ${truncated}`)
    }
  }

  // If we have any content, return it
  if (parts.length > 3) {
    return parts.join('\n')
  }

  return ''
}

/**
 * Assembles the complete system prompt from all three layers.
 *
 * @param workspacePath - Current workspace directory
 * @param openFiles - Array of currently open file paths
 * @param currentFile - Path of the file being edited
 * @param customInstructions - User's custom instructions from settings
 * @param enabledIntegrations - Optional list of enabled MCP integrations for capability awareness
 * @returns Complete system prompt string
 */
export async function assembleSystemPrompt(
  workspacePath: string | null,
  openFiles: string[],
  currentFile: string | null,
  customInstructions: string,
  enabledIntegrations: EnabledIntegration[] = [],
  memoryContext: MemoryContext | null = null,
  customTasksFolder?: string | null  // [Bug Fix] Accept custom tasks folder from settings
): Promise<string> {
  const sections: string[] = []

  // Layer 1: Core identity (always present)
  sections.push(CORE_SYSTEM_PROMPT)

  // Layer 1.5: Capability awareness (enabled integrations)
  const capabilitySection = buildCapabilitySection(enabledIntegrations)
  if (capabilitySection) {
    sections.push(capabilitySection)
  }

  // Layer 1.6: Memory context (user profile and relevant memories)
  const memorySection = buildMemorySection(memoryContext)
  if (memorySection) {
    sections.push(memorySection)
  }

  // Layer 2: User custom instructions (if provided)
  if (customInstructions.trim()) {
    sections.push(`## User Instructions

The user has provided these custom instructions to personalize your behavior:

${customInstructions}`)
  }

  // Layer 3: Dynamic context (gathered at runtime)
  // [Bug Fix] Pass customTasksFolder to context gathering
  const context = await gatherDynamicContext(workspacePath, openFiles, currentFile, customTasksFolder)
  const contextString = formatContextForPrompt(context)
  sections.push(`## Current Context

${contextString}`)

  return sections.join('\n\n---\n\n')
}

/**
 * Get a preview of the core prompt (for settings display)
 */
export function getCorePromptPreview(): string {
  return CORE_SYSTEM_PROMPT
}
