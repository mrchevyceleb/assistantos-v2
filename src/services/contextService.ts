/**
 * Context Service
 * Gathers dynamic context about the environment, git status, workspace,
 * and tasks for injection into the system prompt.
 */

import { parseTasksFromWorkspace, TASKS_FOLDER } from './taskParser'
import type { ParsedTask } from '../types/task'

export interface TaskSummary {
  total: number
  byStatus: { [key: string]: number }
  upcoming: ParsedTask[]  // Tasks due in the next 7 days
  overdue: ParsedTask[]   // Tasks past due date
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
 * Gather all dynamic context for the system prompt
 */
export async function gatherDynamicContext(
  workspacePath: string | null,
  openFiles: string[],
  currentFile: string | null
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

  // Get workspace structure (top-level, non-hidden files)
  try {
    const entries = await window.electronAPI.fs.readDir(workspacePath)
    context.workspaceStructure = entries
      .filter((e) => !e.name.startsWith('.'))
      .slice(0, 20)
      .map((e) => (e.isDirectory ? `${e.name}/` : e.name))
  } catch {
    // Ignore errors reading directory
  }

  // Gather task information if TASKS folder exists
  try {
    const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${TASKS_FOLDER}`
    const tasksExist = await window.electronAPI.fs.exists(tasksPath)

    if (tasksExist) {
      const tasks = await parseTasksFromWorkspace(workspacePath)
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

  // Workspace section
  sections.push(`## Workspace
- Path: ${context.workspacePath || 'No workspace selected'}`)

  // Git section (if in a repo)
  if (context.isGitRepo) {
    let gitSection = `## Git Repository
- Branch: ${context.gitBranch || 'unknown'}
- Status: ${context.gitStatus || '(unknown)'}`

    if (context.recentCommits && context.recentCommits.length > 0) {
      gitSection += `
- Recent commits:
${context.recentCommits.map((c) => `  - ${c}`).join('\n')}`
    }
    sections.push(gitSection)
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

  // Workspace structure
  if (context.workspaceStructure && context.workspaceStructure.length > 0) {
    sections.push(`## Workspace Contents (top-level)
${context.workspaceStructure.join(', ')}`)
  }

  // Tasks section
  if (context.taskSummary) {
    const { total, byStatus, upcoming, overdue } = context.taskSummary
    let taskSection = `## Tasks (from TASKS folder)
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

**⚠️ OVERDUE:**
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

  return sections.join('\n\n')
}
