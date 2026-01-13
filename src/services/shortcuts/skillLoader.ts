/**
 * Skill Loader Service
 *
 * Loads Claude Code-style skills from disk and makes them available as slash commands.
 * Skills are markdown files with YAML frontmatter containing:
 * - name: The command name (without /)
 * - description: Short description for autocomplete
 * - allowed-tools: Optional list of allowed tools
 * - triggers: Optional keywords for auto-activation
 *
 * Skill Locations (same as Claude Code):
 * - ~/.claude/skills/{skill-name}/SKILL.md
 * - ~/.claude/commands/{command-name}.md
 */

import { PromptShortcut } from '@/types/shortcut'

interface SkillFrontmatter {
  name?: string
  description?: string
  'allowed-tools'?: string[]
  triggers?: string[]
  version?: string
  author?: string
  tags?: string[]
}

interface LoadedSkill extends PromptShortcut {
  skillPath: string
  fullContent: string
  allowedTools?: string[]
  triggers?: string[]
}

// Cache for loaded skills
let skillCache: Map<string, LoadedSkill> = new Map()
let lastLoadTime: number = 0
const CACHE_TTL_MS = 60000 // 1 minute cache

/**
 * Get the user's home directory path via Electron IPC
 */
async function getHomeDir(): Promise<string> {
  if (window.electronAPI?.app?.getHomeDir) {
    return await window.electronAPI.app.getHomeDir()
  }
  // Fallback for non-electron environments
  if (typeof process !== 'undefined' && process.env?.HOME) {
    return process.env.HOME
  }
  if (typeof process !== 'undefined' && process.env?.USERPROFILE) {
    return process.env.USERPROFILE
  }
  // Windows default
  return 'C:/Users/' + (process.env?.USERNAME || 'user')
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const [, frontmatterStr, body] = match
  const frontmatter: SkillFrontmatter = {}

  // Simple YAML parsing for common fields
  const lines = frontmatterStr.split('\n')
  let currentKey: string | null = null
  let currentArray: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check for array item
    if (trimmed.startsWith('- ') && currentKey) {
      currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''))
      continue
    }

    // Save previous array if we were collecting one
    if (currentKey && currentArray.length > 0) {
      (frontmatter as any)[currentKey] = currentArray
      currentArray = []
    }

    // Parse key: value
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim()
      const value = trimmed.slice(colonIndex + 1).trim()

      if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array like [item1, item2]
        const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
        ;(frontmatter as any)[key] = items
        currentKey = null
      } else if (value === '' || value === '|' || value === '>') {
        // Array or multiline value follows
        currentKey = key
        currentArray = []
      } else {
        // Simple value
        ;(frontmatter as any)[key] = value.replace(/^["']|["']$/g, '')
        currentKey = null
      }
    }
  }

  // Save final array if we were collecting one
  if (currentKey && currentArray.length > 0) {
    (frontmatter as any)[currentKey] = currentArray
  }

  return { frontmatter, body }
}

/**
 * Load a single skill file
 */
async function loadSkillFile(filePath: string): Promise<LoadedSkill | null> {
  if (!window.electronAPI) return null

  try {
    const content = await window.electronAPI.fs.readFile(filePath)
    if (!content) return null

    const { frontmatter, body } = parseFrontmatter(content)

    // Extract name from frontmatter or filename
    let name = frontmatter.name
    if (!name) {
      // Extract from path: ~/.claude/commands/bigtest.md -> bigtest
      // or ~/.claude/skills/frontend-design/SKILL.md -> frontend-design
      const normalizedPath = filePath.replace(/\\/g, '/')
      if (normalizedPath.includes('/commands/')) {
        name = normalizedPath.split('/').pop()?.replace(/\.md$/i, '')
      } else if (normalizedPath.includes('/skills/')) {
        // Get the skill folder name
        const parts = normalizedPath.split('/')
        const skillIndex = parts.indexOf('skills')
        if (skillIndex >= 0 && skillIndex + 1 < parts.length) {
          name = parts[skillIndex + 1]
        }
      }
    }

    if (!name) {
      console.warn('[SkillLoader] Could not determine skill name for:', filePath)
      return null
    }

    // Normalize name (lowercase, no spaces)
    name = name.toLowerCase().replace(/\s+/g, '-')

    const skill: LoadedSkill = {
      id: `skill-${name}`,
      name,
      description: frontmatter.description || `Skill: ${name}`,
      // For skills, the prompt is the full content (body only, not frontmatter)
      prompt: body.trim(),
      isBuiltIn: false,
      skillPath: filePath,
      fullContent: content,
      allowedTools: frontmatter['allowed-tools'],
      triggers: frontmatter.triggers,
    }

    return skill
  } catch (err) {
    console.error('[SkillLoader] Error loading skill file:', filePath, err)
    return null
  }
}

/**
 * Scan a directory for skill files
 */
async function scanDirectory(dirPath: string, pattern: 'commands' | 'skills'): Promise<LoadedSkill[]> {
  if (!window.electronAPI) return []

  const skills: LoadedSkill[] = []

  try {
    const exists = await window.electronAPI.fs.exists(dirPath)
    if (!exists) return []

    const entries = await window.electronAPI.fs.readDir(dirPath)

    for (const entry of entries) {
      if (pattern === 'commands') {
        // Commands: direct .md files in directory
        if (!entry.isDirectory && entry.name.endsWith('.md')) {
          const skill = await loadSkillFile(entry.path)
          if (skill) skills.push(skill)
        }
      } else if (pattern === 'skills') {
        // Skills: subdirectories with SKILL.md files
        if (entry.isDirectory) {
          const skillMdPath = `${entry.path}/SKILL.md`
          const skillExists = await window.electronAPI.fs.exists(skillMdPath)
          if (skillExists) {
            const skill = await loadSkillFile(skillMdPath)
            if (skill) skills.push(skill)
          }
        }
      }
    }
  } catch (err) {
    console.error('[SkillLoader] Error scanning directory:', dirPath, err)
  }

  return skills
}

/**
 * Load all skills from Claude Code skill directories
 */
export async function loadAllSkills(forceReload = false): Promise<LoadedSkill[]> {
  // Return cached skills if still valid
  if (!forceReload && skillCache.size > 0 && Date.now() - lastLoadTime < CACHE_TTL_MS) {
    return Array.from(skillCache.values())
  }

  const allSkills: LoadedSkill[] = []

  // Get home directory (async)
  const home = await getHomeDir()
  const claudeDir = `${home}/.claude`.replace(/\\/g, '/')

  // Scan commands directory
  const commandsDir = `${claudeDir}/commands`
  const commandSkills = await scanDirectory(commandsDir, 'commands')
  allSkills.push(...commandSkills)

  // Scan skills directory
  const skillsDir = `${claudeDir}/skills`
  const directorySkills = await scanDirectory(skillsDir, 'skills')
  allSkills.push(...directorySkills)

  // Update cache
  skillCache.clear()
  for (const skill of allSkills) {
    skillCache.set(skill.name, skill)
  }
  lastLoadTime = Date.now()

  console.log(`[SkillLoader] Loaded ${allSkills.length} skills:`, allSkills.map(s => s.name))

  return allSkills
}

/**
 * Get a specific skill by name
 */
export async function getSkillByName(name: string): Promise<LoadedSkill | null> {
  // Ensure skills are loaded
  await loadAllSkills()

  return skillCache.get(name.toLowerCase()) || null
}

/**
 * Clear the skill cache (call after adding/removing skills)
 */
export function clearSkillCache(): void {
  skillCache.clear()
  lastLoadTime = 0
}

/**
 * Merge loaded skills with default shortcuts
 * File-based skills override built-ins with the same name
 */
export async function mergeSkillsWithDefaults(
  defaultShortcuts: PromptShortcut[]
): Promise<PromptShortcut[]> {
  const loadedSkills = await loadAllSkills()

  // Create a map of default shortcuts by name
  const shortcutMap = new Map<string, PromptShortcut>()
  for (const shortcut of defaultShortcuts) {
    shortcutMap.set(shortcut.name.toLowerCase(), shortcut)
  }

  // Override with loaded skills (skills take precedence)
  for (const skill of loadedSkills) {
    shortcutMap.set(skill.name.toLowerCase(), skill)
  }

  return Array.from(shortcutMap.values())
}
