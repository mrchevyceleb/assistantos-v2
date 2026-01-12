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

// Filename-based task convention: "ProjectName - Task Title - Due YYYY-MM-DD.md"
// Also supports optional status suffix: "ProjectName - Task Title - Due YYYY-MM-DD [>].md"
const FILENAME_TASK_REGEX = /^(.+?)\s*-\s*(.+?)\s*-\s*Due\s*(\d{4}-\d{2}-\d{2})(?:\s*\[([xXo>? ])\])?\.md$/i

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

// Parse task from filename convention: "ProjectName - Task Title - Due YYYY-MM-DD.md"
function parseTaskFromFilename(filePath: string): ParsedTask | null {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const filename = normalizedPath.split('/').pop() || ''

  const match = filename.match(FILENAME_TASK_REGEX)
  if (!match) return null

  const [, projectName, taskTitle, dueDate, statusChar] = match

  // Determine status from filename marker or calculate from file content
  let status: TaskStatus = 'in_progress' // Default for active tasks
  if (statusChar) {
    status = charToStatus(statusChar)
  }

  return {
    id: generateTaskId(filePath, 0),
    text: taskTitle.trim(),
    status,
    completed: status === 'done',
    filePath,
    lineNumber: 0, // File-level task, not line-specific
    projectName: projectName.trim(),
    dueDate,
    priority: undefined,
    raw: filename,
  }
}

// Calculate task status based on checkbox completion in file content
async function calculateStatusFromContent(filePath: string): Promise<TaskStatus> {
  if (!window.electronAPI) return 'in_progress'

  try {
    const content = await window.electronAPI.fs.readFile(filePath)
    if (!content) return 'in_progress'
    const lines = content.split('\n')

    let totalCheckboxes = 0
    let completedCheckboxes = 0

    for (const line of lines) {
      const match = line.match(TASK_REGEX)
      if (match) {
        totalCheckboxes++
        const char = match[2].toLowerCase()
        if (char === 'x') {
          completedCheckboxes++
        }
      }
    }

    if (totalCheckboxes === 0) return 'todo'
    if (completedCheckboxes === totalCheckboxes) return 'done'
    if (completedCheckboxes > 0) return 'in_progress'
    return 'todo'
  } catch {
    return 'in_progress'
  }
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

// Get list of project names (from folders or filenames depending on convention)
export async function getProjectList(workspacePath: string, customTasksFolder?: string | null): Promise<string[]> {
  const projectSet = new Set<string>()

  if (!window.electronAPI) return []

  const tasksFolder = getTasksFolder(customTasksFolder)
  const tasksPath = `${workspacePath.replace(/\\/g, '/')}/${tasksFolder}`

  try {
    const exists = await window.electronAPI.fs.exists(tasksPath)
    if (!exists) return []

    const entries = await window.electronAPI.fs.readDir(tasksPath)

    // Check if using filename convention
    const mdFiles = entries.filter(e => !e.isDirectory && e.name.endsWith('.md'))
    let filenameMatchCount = 0
    for (const file of mdFiles) {
      if (FILENAME_TASK_REGEX.test(file.name)) {
        filenameMatchCount++
      }
    }
    const useFilenameConvention = mdFiles.length > 0 && filenameMatchCount / mdFiles.length > 0.5

    if (useFilenameConvention) {
      // Extract project names from filenames
      for (const file of mdFiles) {
        const match = file.name.match(FILENAME_TASK_REGEX)
        if (match) {
          projectSet.add(match[1].trim())
        }
      }
    } else {
      // Use folder names as projects
      for (const entry of entries) {
        // Skip hidden folders and templates
        if (entry.name.startsWith('.')) continue
        if (entry.name.startsWith('_')) continue

        if (entry.isDirectory) {
          projectSet.add(entry.name)
        }
      }
    }
  } catch (err) {
    console.error('Error reading projects:', err)
  }

  return Array.from(projectSet).sort()
}

// Detect if folder uses filename-based task convention
async function detectFilenameConvention(tasksPath: string): Promise<boolean> {
  if (!window.electronAPI) return false

  try {
    const entries = await window.electronAPI.fs.readDir(tasksPath)
    const mdFiles = entries.filter(e => !e.isDirectory && e.name.endsWith('.md'))

    if (mdFiles.length === 0) return false

    // Check if majority of files match the filename convention
    let matchCount = 0
    for (const file of mdFiles) {
      if (FILENAME_TASK_REGEX.test(file.name)) {
        matchCount++
      }
    }

    // If more than 50% of files match, use filename mode
    return matchCount / mdFiles.length > 0.5
  } catch {
    return false
  }
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

    // Detect if using filename-based convention (flat structure with named files)
    const useFilenameConvention = await detectFilenameConvention(tasksPath)
    console.log('[taskParser] Using filename convention:', useFilenameConvention)

    if (useFilenameConvention) {
      // Parse files using filename convention: "ProjectName - Task Title - Due YYYY-MM-DD.md"
      const entries = await window.electronAPI.fs.readDir(tasksPath)
      const mdFiles = entries.filter(e => !e.isDirectory && e.name.endsWith('.md'))

      for (const file of mdFiles) {
        const task = parseTaskFromFilename(file.path)
        if (task) {
          // Calculate status from checkbox completion in file
          task.status = await calculateStatusFromContent(file.path)
          task.completed = task.status === 'done'

          // Apply project filter if specified
          if (!projectFilter || task.projectName === projectFilter) {
            tasks.push(task)
          }
        }
      }

      console.log('[taskParser] Parsed tasks from filenames:', tasks.length)
    } else {
      // Use original checkbox-based parsing (subfolder structure)
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

      // Parse each file for checkbox tasks
      for (const filePath of markdownFiles) {
        try {
          const projectName = extractProjectName(filePath, workspacePath, customTasksFolder)
          const content = await window.electronAPI.fs.readFile(filePath)
          if (!content) continue
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
    // Check if this is a file-level task (lineNumber === 0)
    if (lineNumber === 0) {
      // For filename-based tasks, we don't update status manually
      // Status is auto-calculated from checkbox completion in the file
      // Just return true to indicate success (status will refresh on next parse)
      console.log('[taskParser] File-level task status is auto-calculated from checkboxes')
      return true
    }

    // Line-level task: update checkbox in file
    const content = await window.electronAPI.fs.readFile(filePath)
    if (!content) return false
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

// Generate proper filename from task data
export function generateTaskFilename(
  projectName: string,
  taskTitle: string,
  dueDate: string // YYYY-MM-DD format
): string {
  // Sanitize for filename (remove characters not allowed in filenames)
  const sanitize = (str: string) => str.replace(/[<>:"/\\|?*]/g, '-').trim()
  return `${sanitize(projectName)} - ${sanitize(taskTitle)} - Due ${dueDate}.md`
}

// Create a new task file with proper naming convention
export async function createTaskFile(
  tasksPath: string,
  projectName: string,
  taskTitle: string,
  dueDate: string,
  description?: string
): Promise<string | null> {
  if (!window.electronAPI) return null

  try {
    // Ensure tasks folder exists
    const exists = await window.electronAPI.fs.exists(tasksPath)
    if (!exists) {
      await window.electronAPI.fs.createDir(tasksPath)
    }

    const filename = generateTaskFilename(projectName, taskTitle, dueDate)
    const filePath = `${tasksPath.replace(/\\/g, '/')}/${filename}`

    // Check if file already exists
    const fileExists = await window.electronAPI.fs.exists(filePath)
    if (fileExists) {
      console.warn('[taskParser] Task file already exists:', filename)
      return null
    }

    // Create file content
    const content = `# ${taskTitle}

**Project:** ${projectName}
**Due:** ${dueDate}

---

## Tasks

- [ ] First task

${description ? `---\n\n## Notes\n\n${description}\n` : ''}
`

    await window.electronAPI.fs.writeFile(filePath, content)
    return filePath
  } catch (err) {
    console.error('Error creating task file:', err)
    return null
  }
}

// Rename a task file to update its metadata (project, title, or due date)
export async function renameTaskFile(
  currentPath: string,
  newProjectName: string,
  newTaskTitle: string,
  newDueDate: string
): Promise<string | null> {
  if (!window.electronAPI) return null

  try {
    const normalizedPath = currentPath.replace(/\\/g, '/')
    const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
    const newFilename = generateTaskFilename(newProjectName, newTaskTitle, newDueDate)
    const newPath = `${dirPath}/${newFilename}`

    // Don't rename if path is the same
    if (normalizedPath === newPath) return currentPath

    // Check if target already exists
    const targetExists = await window.electronAPI.fs.exists(newPath)
    if (targetExists) {
      console.warn('[taskParser] Cannot rename - target file exists:', newFilename)
      return null
    }

    await window.electronAPI.fs.rename(currentPath, newPath)
    return newPath
  } catch (err) {
    console.error('Error renaming task file:', err)
    return null
  }
}

// Update due date for a file-level task (renames the file)
export async function updateTaskDueDate(
  task: ParsedTask,
  newDueDate: string
): Promise<string | null> {
  if (task.lineNumber !== 0) {
    // Line-level task - update inline
    // TODO: implement inline due date update
    return null
  }

  return renameTaskFile(task.filePath, task.projectName, task.text, newDueDate)
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
