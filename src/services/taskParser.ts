import { ParsedTask } from '../types/task'

// Regex patterns for task parsing
const TASK_REGEX = /^(\s*)- \[([ xX])\] (.+)$/
const DUE_DATE_REGEX = /@due\(([^)]+)\)/
const PRIORITY_REGEX = /!(high|medium|low)/i

// Generate a simple hash for task ID
function generateTaskId(filePath: string, lineNumber: number): string {
  return `${filePath}:${lineNumber}`.replace(/[^a-zA-Z0-9]/g, '_')
}

// Parse a single line for task content
function parseTaskLine(line: string, filePath: string, lineNumber: number): ParsedTask | null {
  const match = line.match(TASK_REGEX)
  if (!match) return null

  const [, , checkmark, content] = match
  const completed = checkmark.toLowerCase() === 'x'

  // Extract due date
  const dueDateMatch = content.match(DUE_DATE_REGEX)
  const dueDate = dueDateMatch ? dueDateMatch[1] : undefined

  // Extract priority
  const priorityMatch = content.match(PRIORITY_REGEX)
  const priority = priorityMatch
    ? (priorityMatch[1].toLowerCase() as 'high' | 'medium' | 'low')
    : undefined

  // Clean the text (remove metadata)
  let text = content
    .replace(DUE_DATE_REGEX, '')
    .replace(PRIORITY_REGEX, '')
    .trim()

  return {
    id: generateTaskId(filePath, lineNumber),
    text,
    completed,
    filePath,
    lineNumber,
    dueDate,
    priority,
    raw: line,
  }
}

// Recursively find all markdown files
async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const files: string[] = []

  if (!window.electronAPI) return files

  try {
    const entries = await window.electronAPI.fs.readDir(dirPath)

    for (const entry of entries) {
      // Skip hidden files and common non-content directories
      if (entry.name.startsWith('.')) continue
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

// Sort tasks by priority (files with task-related names first)
function getFilePriority(filePath: string): number {
  const fileName = filePath.toLowerCase()
  if (fileName.includes('todo')) return 0
  if (fileName.includes('task')) return 1
  if (fileName.includes('project')) return 2
  return 3
}

// Parse all tasks from workspace
export async function parseTasksFromWorkspace(workspacePath: string): Promise<ParsedTask[]> {
  const tasks: ParsedTask[] = []

  if (!window.electronAPI) return tasks

  try {
    const markdownFiles = await findMarkdownFiles(workspacePath)

    // Sort files by priority
    markdownFiles.sort((a, b) => getFilePriority(a) - getFilePriority(b))

    for (const filePath of markdownFiles) {
      try {
        const content = await window.electronAPI.fs.readFile(filePath)
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const task = parseTaskLine(lines[i], filePath, i + 1) // 1-indexed line numbers
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

// Toggle a task's completion status in its source file
export async function toggleTaskInFile(
  filePath: string,
  lineNumber: number,
  completed: boolean
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

    // Replace the checkbox
    const newCheckmark = completed ? 'x' : ' '
    lines[lineIndex] = line.replace(/- \[[ xX]\]/, `- [${newCheckmark}]`)

    // Write back
    await window.electronAPI.fs.writeFile(filePath, lines.join('\n'))
    return true
  } catch (err) {
    console.error('Error toggling task:', err)
    return false
  }
}

// Get filename from path
export function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1]
}
