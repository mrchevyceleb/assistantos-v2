import { ParsedTask, TaskStatus, TASK_STATUS_CONFIG } from '../types/task'

// Default tasks folder name at workspace root
export const TASKS_FOLDER = 'TASKS'

// Get the effective tasks folder path (uses custom if set, otherwise default)
export function getTasksFolder(customFolder: string | null | undefined): string {
  return customFolder || TASKS_FOLDER
}

// Regex patterns for task parsing
// Extended checkbox syntax: [ ] backlog, [o] todo, [>] in progress, [?] review, [x]/[X] done
const TASK_REGEX = /^(\s*)- \[([ xXo>?])\] (.+)$/
const DUE_DATE_REGEX = /@due\(([^)]+)\)/
const PRIORITY_REGEX = /!(high|medium|low)/i

// Map checkbox character to TaskStatus
function charToStatus(char: string): TaskStatus {
  switch (char.toLowerCase()) {
    case 'x': return 'done'
    case 'o': return 'todo'
    case '>': return 'in_progress'
    case '?': return 'review'
    case ' ':
    default: return 'backlog'
  }
}

// Map TaskStatus to checkbox character
export function statusToChar(status: TaskStatus): string {
  return TASK_STATUS_CONFIG[status].checkbox
}

// Generate a simple hash for task ID
function generateTaskId(filePath: string, lineNumber: number): string {
  return `${filePath}:${lineNumber}`.replace(/[^a-zA-Z0-9]/g, '_')
}

// Extract project name from file path
// Expected structure: {tasksFolder}/{ProjectName}/file.md
function extractProjectName(filePath: string, workspacePath: string, customTasksFolder?: string | null): string {
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/')
  const tasksFolder = getTasksFolder(customTasksFolder)

  // Get relative path from workspace
  let relativePath = normalizedFile
  if (normalizedFile.startsWith(normalizedWorkspace)) {
    relativePath = normalizedFile.slice(normalizedWorkspace.length)
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1)
    }
  }

  // Expected: {tasksFolder}/ProjectName/file.md
  const parts = relativePath.split('/')
  if (parts.length >= 3 && parts[0].toUpperCase() === tasksFolder.toUpperCase()) {
    return parts[1] // Return the project folder name
  }

  // Fallback to parent folder name
  if (parts.length >= 2) {
    return parts[parts.length - 2]
  }

  return 'Unknown'
}

// Parse a single line for task content
function parseTaskLine(
  line: string,
  filePath: string,
  lineNumber: number,
  projectName: string
): ParsedTask | null {
  const match = line.match(TASK_REGEX)
  if (!match) return null

  const [, , checkmark, content] = match
  const status = charToStatus(checkmark)
  const completed = status === 'done'

  // Extract due date
  const dueDateMatch = content.match(DUE_DATE_REGEX)
  const dueDate = dueDateMatch ? dueDateMatch[1] : undefined

  // Extract priority
  const priorityMatch = content.match(PRIORITY_REGEX)
  const priority = priorityMatch
    ? (priorityMatch[1].toLowerCase() as 'high' | 'medium' | 'low')
    : undefined

  // Clean the text (remove metadata)
  const text = content
    .replace(DUE_DATE_REGEX, '')
    .replace(PRIORITY_REGEX, '')
    .trim()

  return {
    id: generateTaskId(filePath, lineNumber),
    text,
    status,
    completed,
    filePath,
    lineNumber,
    projectName,
    dueDate,
    priority,
    raw: line,
  }
}

// Recursively find all markdown files in a directory
async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const files: string[] = []

  if (!window.electronAPI) return files

  try {
    const entries = await window.electronAPI.fs.readDir(dirPath)

    for (const entry of entries) {
      // Skip hidden files and common non-content directories
      if (entry.name.startsWith('.')) continue
      if (entry.name.startsWith('_')) continue // Skip _templates etc
      if (['node_modules', 'dist', 'build', '.git', '__pycache__'].includes(entry.name)) continue

      if (entry.isDirectory) {
        const subFiles = await findMarkdownFiles(entry.path)
        files.push(...subFiles)
      } else if (entry.name.endsWith('.md')) {
        files.push(entry.path)
      }
    }
  } catch (err) {
    console.error('Error scanning directory:', dirPath, err)
  }

  return files
}

// Get list of project folders in tasks directory
export async function getProjectList(workspacePath: string, customTasksFolder?: string | null): Promise<string[]> {
  const projects: string[] = []

  if (!window.electronAPI) return projects

  const tasksFolder = getTasksFolder(customTasksFolder)
  const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${tasksFolder}`

  try {
    const exists = await window.electronAPI.fs.exists(tasksPath)
    if (!exists) return projects

    const entries = await window.electronAPI.fs.readDir(tasksPath)

    for (const entry of entries) {
      // Skip hidden folders and templates
      if (entry.name.startsWith('.')) continue
      if (entry.name.startsWith('_')) continue

      if (entry.isDirectory) {
        projects.push(entry.name)
      }
    }
  } catch (err) {
    console.error('Error reading projects:', err)
  }

  return projects.sort()
}

// Parse all tasks from the tasks folder
export async function parseTasksFromWorkspace(
  workspacePath: string,
  projectFilter?: string | null, // Optional: filter to specific project
  customTasksFolder?: string | null // Optional: custom tasks folder path
): Promise<ParsedTask[]> {
  const tasks: ParsedTask[] = []

  if (!window.electronAPI) return tasks

  const tasksFolder = getTasksFolder(customTasksFolder)
  const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${tasksFolder}`

  try {
    // Check if TASKS folder exists
    const exists = await window.electronAPI.fs.exists(tasksPath)
    if (!exists) {
      console.log('[taskParser] TASKS folder does not exist:', tasksPath)
      return tasks
    }

    // Find all markdown files in TASKS folder (or specific project)
    let markdownFiles: string[] = []

    if (projectFilter) {
      // Scan only the specified project folder
      const projectPath = `${tasksPath}/${projectFilter}`
      const projectExists = await window.electronAPI.fs.exists(projectPath)
      if (projectExists) {
        markdownFiles = await findMarkdownFiles(projectPath)
      }
    } else {
      // Scan all projects
      markdownFiles = await findMarkdownFiles(tasksPath)
    }

    console.log('[taskParser] Found markdown files:', markdownFiles.length)

    // Parse each file
    for (const filePath of markdownFiles) {
      try {
        const projectName = extractProjectName(filePath, workspacePath, customTasksFolder)
        const content = await window.electronAPI.fs.readFile(filePath)
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const task = parseTaskLine(lines[i], filePath, i + 1, projectName)
          if (task) {
            tasks.push(task)
          }
        }
      } catch (err) {
        console.error('Error reading file:', filePath, err)
      }
    }
  } catch (err) {
    console.error('Error parsing tasks:', err)
  }

  return tasks
}

// Update a task's status in its source file
export async function updateTaskStatus(
  filePath: string,
  lineNumber: number,
  newStatus: TaskStatus
): Promise<boolean> {
  if (!window.electronAPI) return false

  try {
    const content = await window.electronAPI.fs.readFile(filePath)
    const lines = content.split('\n')

    const lineIndex = lineNumber - 1 // Convert to 0-indexed
    if (lineIndex < 0 || lineIndex >= lines.length) return false

    const line = lines[lineIndex]
    const match = line.match(TASK_REGEX)
    if (!match) return false

    // Replace the checkbox with new status character
    const newCheckmark = statusToChar(newStatus)
    lines[lineIndex] = line.replace(/- \[[ xXo>?]\]/, `- [${newCheckmark}]`)

    // Write back
    await window.electronAPI.fs.writeFile(filePath, lines.join('\n'))
    return true
  } catch (err) {
    console.error('Error updating task status:', err)
    return false
  }
}

// Toggle a task's completion status (legacy function for backward compat)
export async function toggleTaskInFile(
  filePath: string,
  lineNumber: number,
  completed: boolean
): Promise<boolean> {
  return updateTaskStatus(filePath, lineNumber, completed ? 'done' : 'backlog')
}

// Get filename from path
export function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1]
}

// Create a new project folder with initial tasks.md
export async function createProject(
  workspacePath: string,
  projectName: string,
  customTasksFolder?: string | null
): Promise<boolean> {
  if (!window.electronAPI) return false

  const tasksFolder = getTasksFolder(customTasksFolder)
  const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${tasksFolder}`
  const projectPath = `${tasksPath}/${projectName}`

  try {
    // Create TASKS folder if it doesn't exist
    const tasksExists = await window.electronAPI.fs.exists(tasksPath)
    if (!tasksExists) {
      await window.electronAPI.fs.createDir(tasksPath)
    }

    // Create project folder
    const projectExists = await window.electronAPI.fs.exists(projectPath)
    if (projectExists) {
      console.warn('Project already exists:', projectName)
      return false
    }

    await window.electronAPI.fs.createDir(projectPath)

    // Create initial tasks.md file
    const initialContent = `# ${projectName} Tasks

## Active Tasks

- [ ] First task (edit or delete this)

## Notes

Add any project notes here.
`
    await window.electronAPI.fs.writeFile(`${projectPath}/tasks.md`, initialContent)

    return true
  } catch (err) {
    console.error('Error creating project:', err)
    return false
  }
}
