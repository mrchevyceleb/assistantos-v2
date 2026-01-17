/**
 * Context Service
 * Gathers dynamic context about the environment, git status, workspace,
 * and tasks for injection into the system prompt.
 */

import { parseTasksFromWorkspace, getTasksFolder } from './taskParser'
import type { ParsedTask } from '../types/task'

export interface TaskSummary {
  total: number
  byStatus: { [key: string]: number }
  upcoming: ParsedTask[]  // Tasks due in the next 7 days
  overdue: ParsedTask[]   // Tasks past due date
}

/**
 * Standard folder conventions for personal workspace organization
 */
export const WORKSPACE_FOLDER_CONVENTIONS: { [key: string]: string } = {
  '00-Intake': 'New items to process and triage',
  '00-Inbox': 'New items to process and triage',
  '01-Active': 'Currently active work and projects',
  '02-Completed': 'Finished work for reference',
  '02-Someday': 'Items to revisit later',
  '03-Templates': 'Reusable templates and boilerplates',
  '03-Reference': 'Reference materials and documentation',
  '04-Generated': 'AI-generated content and outputs',
  '04-Archive': 'Archived items',
  '05-Projects': 'Project folders and workspaces',
  '06-Systems': 'System configurations and automations',
  '07-Reference': 'Reference materials and documentation',
  'TASKS': 'Task management folder',
  'Tasks': 'Task management folder',
  'tasks': 'Task management folder',
}

export interface WorkspaceStructureEntry {
  name: string
  isDirectory: boolean
  description?: string  // From folder conventions
  isKnownConvention: boolean
}

export interface EnhancedWorkspaceStructure {
  entries: WorkspaceStructureEntry[]
  hasTasksFolder: boolean
  hasConventionalFolders: boolean
  workspaceType: 'personal' | 'code' | 'mixed' | 'unknown'
}

export interface DynamicContext {
  platform: string
  currentDate: string
  currentTime: string
  workspacePath: string | null
  isGitRepo: boolean
  gitBranch?: string
  gitStatus?: string
  recentCommits?: string[]
  openFiles: string[]
  currentFile: string | null
  workspaceStructure?: string[]
  enhancedWorkspaceStructure?: EnhancedWorkspaceStructure
  taskSummary?: TaskSummary
}

/**
 * Get platform information
 */
function getPlatformInfo(): string {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'Windows'
  if (platform.includes('mac')) return 'macOS'
  if (platform.includes('linux')) return 'Linux'
  return platform
}

/**
 * Indicators that suggest this is primarily a code project
 */
const CODE_PROJECT_INDICATORS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  '.sln',
  'Makefile',
  'CMakeLists.txt',
  'src/',
  'lib/',
  'test/',
  'tests/',
]

/**
 * Analyze workspace structure and detect type
 */
async function gatherEnhancedWorkspaceStructure(
  workspacePath: string
): Promise<EnhancedWorkspaceStructure | null> {
  try {
    const entries = await window.electronAPI.fs.readDir(workspacePath)

    // Filter out hidden files and process entries
    const processedEntries: WorkspaceStructureEntry[] = entries
      .filter((e) => !e.name.startsWith('.'))
      .slice(0, 30)
      .map((e) => {
        const displayName = e.isDirectory ? `${e.name}/` : e.name
        const baseName = e.name
        const isKnownConvention = baseName in WORKSPACE_FOLDER_CONVENTIONS

        return {
          name: displayName,
          isDirectory: e.isDirectory,
          description: isKnownConvention ? WORKSPACE_FOLDER_CONVENTIONS[baseName] : undefined,
          isKnownConvention,
        }
      })

    // Detect workspace characteristics
    const hasTasksFolder = entries.some(
      (e) => e.isDirectory && ['TASKS', 'Tasks', 'tasks'].includes(e.name)
    )

    const conventionalFolderCount = processedEntries.filter(
      (e) => e.isKnownConvention
    ).length

    const hasConventionalFolders = conventionalFolderCount >= 2

    // Detect if this is a code project
    const codeIndicatorCount = entries.filter(
      (e) => CODE_PROJECT_INDICATORS.includes(e.name) ||
             CODE_PROJECT_INDICATORS.includes(`${e.name}/`)
    ).length

    // Determine workspace type
    let workspaceType: 'personal' | 'code' | 'mixed' | 'unknown' = 'unknown'

    if (hasConventionalFolders && codeIndicatorCount === 0) {
      workspaceType = 'personal'
    } else if (codeIndicatorCount >= 2 && !hasConventionalFolders) {
      workspaceType = 'code'
    } else if (hasConventionalFolders && codeIndicatorCount > 0) {
      workspaceType = 'mixed'
    } else if (codeIndicatorCount > 0) {
      workspaceType = 'code'
    } else if (hasTasksFolder) {
      workspaceType = 'personal'
    }

    return {
      entries: processedEntries,
      hasTasksFolder,
      hasConventionalFolders,
      workspaceType,
    }
  } catch {
    return null
  }
}

/**
 * Gather all dynamic context for the system prompt
 */
export async function gatherDynamicContext(
  workspacePath: string | null,
  openFiles: string[],
  currentFile: string | null,
  customTasksFolder?: string | null  // [Bug Fix] Accept custom tasks folder from settings
): Promise<DynamicContext> {
  const now = new Date()

  const context: DynamicContext = {
    platform: getPlatformInfo(),
    currentDate: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    currentTime: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    workspacePath,
    isGitRepo: false,
    openFiles,
    currentFile,
  }

  // If no workspace, return basic context
  if (!workspacePath) {
    return context
  }

  // Check if workspace is a git repository and gather git info
  try {
    const gitCheck = await window.electronAPI.bash.execute(
      'git rev-parse --is-inside-work-tree',
      workspacePath
    )

    if (gitCheck.exitCode === 0) {
      context.isGitRepo = true

      // Get current branch
      const branchResult = await window.electronAPI.bash.execute(
        'git branch --show-current',
        workspacePath
      )
      if (branchResult.exitCode === 0) {
        context.gitBranch = branchResult.stdout.trim()
      }

      // Get git status summary
      const statusResult = await window.electronAPI.bash.execute(
        'git status --short',
        workspacePath
      )
      if (statusResult.exitCode === 0) {
        context.gitStatus = statusResult.stdout.trim() || '(clean)'
      }

      // Get recent commits (last 5)
      const commitsResult = await window.electronAPI.bash.execute(
        'git log --oneline -5 2>nul || git log --oneline -5 2>/dev/null',
        workspacePath
      )
      if (commitsResult.exitCode === 0 && commitsResult.stdout.trim()) {
        context.recentCommits = commitsResult.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
      }
    }
  } catch {
    // Git not available or not a repo - silently ignore
  }

  // Get enhanced workspace structure with folder convention detection
  const enhancedStructure = await gatherEnhancedWorkspaceStructure(workspacePath)
  if (enhancedStructure) {
    context.enhancedWorkspaceStructure = enhancedStructure
    // Also maintain backward compatibility with simple structure
    context.workspaceStructure = enhancedStructure.entries.map((e) => e.name)
  } else {
    // Fallback: Get workspace structure (top-level, non-hidden files)
    try {
      const entries = await window.electronAPI.fs.readDir(workspacePath)
      context.workspaceStructure = entries
        .filter((e) => !e.name.startsWith('.'))
        .slice(0, 20)
        .map((e) => (e.isDirectory ? `${e.name}/` : e.name))
    } catch {
      // Ignore errors reading directory
    }
  }

  // Gather task information if TASKS folder exists
  try {
    // [Bug Fix] Use getTasksFolder to respect custom tasks folder setting
    const effectiveTasksFolder = getTasksFolder(customTasksFolder)
    const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${effectiveTasksFolder}`
    const tasksExist = await window.electronAPI.fs.exists(tasksPath)

    if (tasksExist) {
      // [Bug Fix] Pass customTasksFolder to parseTasksFromWorkspace
      const tasks = await parseTasksFromWorkspace(workspacePath, null, customTasksFolder)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)

      // Count by status
      const byStatus: { [key: string]: number } = {}
      const upcoming: ParsedTask[] = []
      const overdue: ParsedTask[] = []

      for (const task of tasks) {
        byStatus[task.status] = (byStatus[task.status] || 0) + 1

        if (task.dueDate && task.status !== 'done') {
          const dueDate = new Date(task.dueDate)
          dueDate.setHours(0, 0, 0, 0)

          if (dueDate < today) {
            overdue.push(task)
          } else if (dueDate <= nextWeek) {
            upcoming.push(task)
          }
        }
      }

      // Sort by due date
      const sortByDue = (a: ParsedTask, b: ParsedTask) => {
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }

      context.taskSummary = {
        total: tasks.length,
        byStatus,
        upcoming: upcoming.sort(sortByDue).slice(0, 5),
        overdue: overdue.sort(sortByDue).slice(0, 5),
      }
    }
  } catch {
    // Ignore errors reading tasks
  }

  return context
}

/**
 * Format dynamic context as markdown for inclusion in system prompt
 */
export function formatContextForPrompt(context: DynamicContext): string {
  const sections: string[] = []

  // Environment section
  sections.push(`## Environment
- Platform: ${context.platform}
- Date: ${context.currentDate}
- Time: ${context.currentTime}`)

  // Workspace section with enhanced awareness
  if (context.enhancedWorkspaceStructure) {
    const ews = context.enhancedWorkspaceStructure
    let workspaceSection = `## Workspace
- Path: ${context.workspacePath || 'No workspace selected'}
- Type: ${ews.workspaceType === 'personal' ? 'Personal/Productivity workspace' :
         ews.workspaceType === 'code' ? 'Code project' :
         ews.workspaceType === 'mixed' ? 'Mixed (personal + code)' : 'General workspace'}`

    // Add folder structure with descriptions for conventional folders
    if (ews.entries.length > 0) {
      workspaceSection += `

### Folder Structure`

      // Group entries: conventional folders first, then others
      const conventionalEntries = ews.entries.filter(e => e.isKnownConvention)
      const otherEntries = ews.entries.filter(e => !e.isKnownConvention)

      if (conventionalEntries.length > 0) {
        workspaceSection += `
**Organized folders:**`
        for (const entry of conventionalEntries) {
          workspaceSection += `
- ${entry.name}${entry.description ? ` - ${entry.description}` : ''}`
        }
      }

      if (otherEntries.length > 0) {
        workspaceSection += `
**Other contents:** ${otherEntries.map(e => e.name).join(', ')}`
      }
    }

    sections.push(workspaceSection)
  } else {
    sections.push(`## Workspace
- Path: ${context.workspacePath || 'No workspace selected'}`)
  }

  // Tasks section (PRIORITY - show before git, as this is what users typically mean by "edits needed")
  if (context.taskSummary) {
    const { total, byStatus, upcoming, overdue } = context.taskSummary
    let taskSection = `## Tasks (from TASKS folder) - CHECK HERE FOR "EDITS NEEDED"
- Total tasks: ${total}`

    // Status breakdown
    const statusEntries = Object.entries(byStatus)
    if (statusEntries.length > 0) {
      taskSection += `
- By status: ${statusEntries.map(([s, c]) => `${s}: ${c}`).join(', ')}`
    }

    // Overdue tasks (important!)
    if (overdue.length > 0) {
      taskSection += `

**OVERDUE:**
${overdue.map(t => `- [${t.projectName}] ${t.text} (due ${t.dueDate})`).join('\n')}`
    }

    // Upcoming tasks
    if (upcoming.length > 0) {
      taskSection += `

**Upcoming (next 7 days):**
${upcoming.map(t => `- [${t.projectName}] ${t.text} (due ${t.dueDate})`).join('\n')}`
    }

    sections.push(taskSection)
  }

  // Open files section
  if (context.openFiles.length > 0) {
    let filesSection = `## Open Files
${context.openFiles.map((f) => `- ${f}`).join('\n')}`

    if (context.currentFile) {
      filesSection += `

Currently editing: ${context.currentFile}`
    }
    sections.push(filesSection)
  }

  // Note: Workspace structure is now included in the enhanced Workspace section above
  // Only show simple list if enhanced structure wasn't available
  if (!context.enhancedWorkspaceStructure && context.workspaceStructure && context.workspaceStructure.length > 0) {
    sections.push(`## Workspace Contents (top-level)
${context.workspaceStructure.join(', ')}`)
  }

  // Git section (background info only - DO NOT use for "edits needed" questions unless user asks about git)
  if (context.isGitRepo) {
    let gitSection = `## Git Repository (background info - only reference when user asks about git/commits)
- Branch: ${context.gitBranch || 'unknown'}
- Status: ${context.gitStatus || '(unknown)'}`

    if (context.recentCommits && context.recentCommits.length > 0) {
      gitSection += `
- Recent commits:
${context.recentCommits.map((c) => `  - ${c}`).join('\n')}`
    }
    sections.push(gitSection)
  }

  return sections.join('\n\n')
}
