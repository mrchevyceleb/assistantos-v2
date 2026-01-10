/**
 * Context Service
 * Gathers dynamic context about the environment, git status, and workspace
 * for injection into the system prompt.
 */

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

  return sections.join('\n\n')
}
