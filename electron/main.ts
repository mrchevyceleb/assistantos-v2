import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, session } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import { registerMCPHandlers, cleanupMCPHandlers } from './mcp/ipcHandlers.js'
import { registerMemoryHandlers, cleanupMemoryHandlers } from './memory/ipcHandlers.js'
import { initAutoUpdater, checkForUpdates, getUpdateStatus, installUpdate } from './services/autoUpdater.js'

const execAsync = promisify(exec)

// =============================================================================
// Security: Path Validation
// =============================================================================

/**
 * Validate that a path is within allowed directories
 * Prevents path traversal attacks (e.g., ../../etc/passwd)
 */
function isPathAllowed(targetPath: string, allowedBasePaths: string[]): boolean {
  try {
    const normalizedTarget = path.resolve(targetPath)
    return allowedBasePaths.some(basePath => {
      const normalizedBase = path.resolve(basePath)
      return normalizedTarget.startsWith(normalizedBase + path.sep) || normalizedTarget === normalizedBase
    })
  } catch {
    return false
  }
}

/**
 * Get list of allowed base paths for file operations
 * Includes workspace path and app data directory
 */
function getAllowedPaths(): string[] {
  const allowed = [
    app.getPath('userData'), // App data (conversations, etc.)
    app.getPath('temp'),      // Temp files
  ]
  return allowed.filter(Boolean)
}

// Track current workspace path for validation
let currentWorkspacePath: string | null = null

/**
 * Check if a path is safe for file operations
 * Allows workspace path and app-specific directories
 */
function validatePath(targetPath: string): boolean {
  const allowedPaths = getAllowedPaths()
  if (currentWorkspacePath) {
    allowedPaths.push(currentWorkspacePath)
  }
  return isPathAllowed(targetPath, allowedPaths)
}

// =============================================================================
// Security: Shell Command Validation
// =============================================================================

// Dangerous command patterns that should be blocked
const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+(-rf?|-fr?)\s+\/(?!\w)/i,     // rm -rf / (root deletion)
  /rm\s+(-rf?|-fr?)\s+~\/?$/i,        // rm -rf ~ (home deletion)
  /:(){ :|:& };:/,                     // Fork bomb
  />\s*\/dev\/sd[a-z]/i,              // Direct disk write
  /dd\s+.*of=\/dev\/sd[a-z]/i,        // dd to disk
  /mkfs/i,                             // Format filesystem
  /shutdown/i,                         // Shutdown command
  /reboot/i,                           // Reboot command
  /halt/i,                             // Halt command
  /init\s+[0-6]/i,                    // Runlevel change
  /format\s+[a-z]:/i,                 // Windows format
  /del\s+\/[sfq]\s+[a-z]:\\/i,        // Windows recursive delete
]

/**
 * Check if a shell command contains dangerous patterns
 */
function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some(pattern => pattern.test(command))
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  })

  // Set Content Security Policy headers for production
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;" +
            "style-src 'self' 'unsafe-inline';" +
            "img-src 'self' data: blob: https:;" +
            "font-src 'self' data:;" +
            "connect-src 'self' https://api.anthropic.com https://api.openai.com https://*.supabase.co wss://*.supabase.co https://wttr.in;" +
            "frame-src 'self';" +
            "object-src 'none';" +
            "base-uri 'self';"
          ]
        }
      })
    })
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Register MCP handlers
  registerMCPHandlers()
  registerMemoryHandlers()

  // Configure webview session for browser panel
  const browserSession = session.fromPartition('persist:browser')

  // Set permissions for webview (allow all standard web permissions)
  browserSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'media', 'geolocation', 'notifications', 'midiSysex',
      'pointerLock', 'fullscreen', 'openExternal', 'clipboard-read',
      'clipboard-sanitized-write'
    ]
    callback(allowedPermissions.includes(permission))
  })

  // Allow webview to make web requests
  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders })
  })

  // Handle certificate errors - log details for debugging
  browserSession.setCertificateVerifyProc((request, callback) => {
    // Log certificate errors for debugging
    if (request.errorCode !== 0) {
      console.warn('[Browser] Certificate error:', {
        hostname: request.hostname,
        errorCode: request.errorCode,
        certificate: {
          subject: request.certificate?.subjectName,
          issuer: request.certificate?.issuerName,
          validStart: request.certificate?.validStart,
          validExpiry: request.certificate?.validExpiry,
        }
      })
    }
    // Use default verification (don't bypass)
    callback(-3) // -3 means use default behavior
  })

  createWindow()

  // Initialize auto-updater (only runs in production)
  if (mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup MCP servers before quitting
app.on('before-quit', async () => {
  await cleanupMCPHandlers()
  cleanupMemoryHandlers()
})

// IPC Handlers for window controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

// IPC Handlers for auto-updater
ipcMain.handle('updater:checkForUpdates', async () => {
  try {
    await checkForUpdates()
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('updater:getStatus', () => {
  return getUpdateStatus()
})

ipcMain.handle('updater:installUpdate', () => {
  installUpdate()
})

// IPC Handlers for file system
ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const result = entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    // Debug: log file counts
    const fileCount = result.filter(e => !e.isDirectory).length
    const dirCount = result.filter(e => e.isDirectory).length
    console.log(`[fs:readDir] ${dirPath}: ${fileCount} files, ${dirCount} dirs`)
    return result
  } catch (error) {
    console.error('Error reading directory:', error)
    return []
  }
})

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading file:', error)
    return null
  }
})

// IPC Handler for reading files as base64 (for media files)
ipcMain.handle('fs:readFileBase64', async (_, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath)
    const base64 = buffer.toString('base64')
    return { success: true, data: base64 }
  } catch (error) {
    console.error('Error reading file as base64:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error('Error writing file:', error)
    return false
  }
})

ipcMain.handle('fs:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('fs:createDir', async (_, dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return true
  } catch (error) {
    console.error('Error creating directory:', error)
    return false
  }
})

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
})

// IPC Handler for renaming files/folders
ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
  try {
    // Check if target already exists
    try {
      await fs.promises.access(newPath)
      return { success: false, error: 'A file or folder with that name already exists' }
    } catch {
      // Target doesn't exist, safe to rename
    }

    await fs.promises.rename(oldPath, newPath)
    return { success: true }
  } catch (error) {
    console.error('Error renaming file:', error)
    return { success: false, error: String(error) }
  }
})

// IPC Handler for deleting files/folders
ipcMain.handle('fs:delete', async (_, targetPath: string) => {
  try {
    const stat = await fs.promises.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(targetPath)
    }
    return { success: true }
  } catch (error) {
    console.error('Error deleting file:', error)
    return { success: false, error: String(error) }
  }
})

// IPC Handler for copying path to clipboard
ipcMain.handle('fs:copyPath', async (_, filePath: string) => {
  try {
    clipboard.writeText(filePath)
    return { success: true }
  } catch (error) {
    console.error('Error copying path:', error)
    return { success: false, error: String(error) }
  }
})

// IPC Handler for showing file in system file explorer
ipcMain.handle('fs:showInExplorer', async (_, filePath: string) => {
  try {
    shell.showItemInFolder(filePath)
    return { success: true }
  } catch (error) {
    console.error('Error showing in explorer:', error)
    return { success: false, error: String(error) }
  }
})

// IPC Handler for getting file/folder info
ipcMain.handle('fs:getInfo', async (_, filePath: string) => {
  try {
    const stat = await fs.promises.stat(filePath)
    return {
      success: true,
      info: {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
      }
    }
  } catch (error) {
    console.error('Error getting file info:', error)
    return { success: false, error: String(error) }
  }
})

// IPC Handler for setting workspace path (for security validation)
ipcMain.handle('workspace:setPath', async (_, workspacePath: string | null) => {
  currentWorkspacePath = workspacePath
  return { success: true }
})

// IPC Handler for bash command execution
ipcMain.handle('bash:execute', async (_, command: string, cwd: string) => {
  // Security: Check for dangerous command patterns
  if (isDangerousCommand(command)) {
    console.error('[Security] Blocked dangerous command:', command)
    return {
      stdout: '',
      stderr: 'Error: This command has been blocked for security reasons. It matches a pattern known to be destructive.',
      exitCode: 1
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || String(error),
      exitCode: execError.code || 1
    }
  }
})

// IPC Handler for opening external URLs in native browser
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  try {
    await shell.openExternal(url)
    return true
  } catch (error) {
    console.error('Error opening external URL:', error)
    return false
  }
})

// IPC Handler for opening a file/folder in the default app or file explorer
ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  try {
    // Check if the path exists
    await fs.promises.access(filePath)
    // Open the file in the default application
    const result = await shell.openPath(filePath)
    // shell.openPath returns empty string on success, error message on failure
    if (result) {
      console.error('Error opening path:', result)
      return { success: false, error: result }
    }
    return { success: true }
  } catch (error) {
    console.error('Error opening path:', error)
    return { success: false, error: String(error) }
  }
})

// Constants for file search
const FILE_SEARCH_MAX_RESULTS = 20
const FILE_SEARCH_MAX_DEPTH = 4
const EXCLUDED_DIRECTORIES = new Set([
  '.git', 'node_modules', '.obsidian', '.vscode',
  'dist', 'build', 'coverage', '__pycache__', '.next', '.cache'
])

/**
 * Check if all keywords match somewhere in the path
 * Keywords can appear in any order and anywhere in the path
 */
function matchesKeywords(pathLower: string, keywords: string[]): boolean {
  return keywords.every(keyword => pathLower.includes(keyword))
}

/**
 * Recursively search a directory for files matching the search term
 * Supports keyword-based matching: "agent chat" matches "src/chat/AgentChat.tsx"
 */
async function searchDirectoryRecursively(
  dirPath: string,
  keywords: string[],
  results: Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }>,
  relativePath: string = ''
): Promise<void> {
  if (results.length >= FILE_SEARCH_MAX_RESULTS) return

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= FILE_SEARCH_MAX_RESULTS) break

      const isHiddenDir = entry.name.startsWith('.') && entry.isDirectory()
      const isExcludedDir = entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)

      if (isHiddenDir || isExcludedDir) continue

      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
      const fullPath = path.join(dirPath, entry.name)
      const pathLower = entryRelativePath.toLowerCase()

      // Match against full path using keyword matching
      if (matchesKeywords(pathLower, keywords)) {
        results.push({
          name: entry.name,
          path: fullPath,
          relativePath: entryRelativePath,
          isDirectory: entry.isDirectory()
        })
      }

      // Recurse into directories (respecting max depth)
      const currentDepth = entryRelativePath.split('/').length
      if (entry.isDirectory() && currentDepth < FILE_SEARCH_MAX_DEPTH) {
        await searchDirectoryRecursively(fullPath, keywords, results, entryRelativePath)
      }
    }
  } catch {
    // Ignore permission errors during directory traversal
  }
}

/**
 * Sort search results with smart ranking:
 * 1. Filename matches all keywords
 * 2. Filename starts with first keyword
 * 3. Path matches (sorted by path length - shorter = more relevant)
 */
function sortSearchResults(
  results: Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }>,
  keywords: string[]
): void {
  results.sort((a, b) => {
    const aNameLower = a.name.toLowerCase()
    const bNameLower = b.name.toLowerCase()

    // Score: filename matches all keywords (highest priority)
    const aNameMatchesAll = keywords.every(k => aNameLower.includes(k))
    const bNameMatchesAll = keywords.every(k => bNameLower.includes(k))
    if (aNameMatchesAll !== bNameMatchesAll) return aNameMatchesAll ? -1 : 1

    // Score: filename starts with first keyword
    const aStartsWith = keywords.length > 0 && aNameLower.startsWith(keywords[0])
    const bStartsWith = keywords.length > 0 && bNameLower.startsWith(keywords[0])
    if (aStartsWith !== bStartsWith) return aStartsWith ? -1 : 1

    // Finally, prefer shorter paths (more relevant)
    return a.relativePath.length - b.relativePath.length
  })
}

// IPC Handler for searching workspace files (for @document mentions)
ipcMain.handle('fs:searchFiles', async (_, workspacePath: string, searchTerm: string) => {
  try {
    const results: Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }> = []

    // Split search term into keywords, filter empty strings
    const keywords = searchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return []

    await searchDirectoryRecursively(workspacePath, keywords, results)
    sortSearchResults(results, keywords)

    return results
  } catch (error) {
    console.error('Error searching files:', error)
    return []
  }
})

// =============================================================================
// Conversation Persistence Handlers
// =============================================================================

/**
 * Get the directory where conversations are stored
 */
function getConversationsDir(): string {
  return path.join(app.getPath('userData'), 'conversations')
}

/**
 * Ensure the conversations directory exists
 */
async function ensureConversationsDir(): Promise<void> {
  const dir = getConversationsDir()
  await fs.promises.mkdir(dir, { recursive: true })
}

// Save a conversation
ipcMain.handle('conversation:save', async (_, conversation: {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  model: string
  messages: Array<{
    id: string
    role: string
    content: string
    timestamp: string
    toolName?: string
    toolResult?: string
    bookmarked?: boolean
  }>
  bookmarks: string[]
  workspace: string | null
}) => {
  try {
    await ensureConversationsDir()
    const filePath = path.join(getConversationsDir(), `${conversation.id}.json`)
    await fs.promises.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8')
    return { success: true, id: conversation.id }
  } catch (error) {
    console.error('Error saving conversation:', error)
    return { success: false, error: String(error) }
  }
})

// Load a conversation by ID
ipcMain.handle('conversation:load', async (_, conversationId: string) => {
  try {
    const filePath = path.join(getConversationsDir(), `${conversationId}.json`)
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Error loading conversation:', error)
    return null
  }
})

// List all saved conversations (metadata only)
ipcMain.handle('conversation:list', async () => {
  try {
    await ensureConversationsDir()
    const dir = getConversationsDir()
    const files = await fs.promises.readdir(dir)
    const conversations: Array<{
      id: string
      title: string
      createdAt: string
      updatedAt: string
      messageCount: number
      preview: string
    }> = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const filePath = path.join(dir, file)
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const conv = JSON.parse(content)

        // Extract metadata
        const lastMessage = conv.messages?.find((m: { role: string }) => m.role === 'assistant' || m.role === 'user')
        const preview = lastMessage?.content?.slice(0, 100) || ''

        conversations.push({
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv.messages?.length || 0,
          preview: preview.length === 100 ? preview + '...' : preview
        })
      } catch {
        // Skip invalid files
      }
    }

    // Sort by updatedAt (newest first)
    conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return conversations
  } catch (error) {
    console.error('Error listing conversations:', error)
    return []
  }
})

// Delete a conversation
ipcMain.handle('conversation:delete', async (_, conversationId: string) => {
  try {
    const filePath = path.join(getConversationsDir(), `${conversationId}.json`)
    await fs.promises.unlink(filePath)
    return { success: true }
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return { success: false, error: String(error) }
  }
})

// Export conversation to markdown file
ipcMain.handle('conversation:export', async (_, markdown: string, suggestedName: string) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Conversation',
      defaultPath: suggestedName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    await fs.promises.writeFile(result.filePath, markdown, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error) {
    console.error('Error exporting conversation:', error)
    return { success: false, error: String(error) }
  }
})

// =============================================================================
// File Content Search Handler (for workspace-wide search)
// =============================================================================

// Constants for content search
const CONTENT_SEARCH_MAX_RESULTS = 50
const CONTENT_SEARCH_MAX_FILE_SIZE = 1024 * 1024 // 1MB max file size
const CONTENT_SEARCH_EXCLUDED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.map'
])

/**
 * Check if a file should be searched based on extension
 */
function isSearchableFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return !CONTENT_SEARCH_EXCLUDED_EXTENSIONS.has(ext)
}

interface ContentSearchResult {
  filePath: string
  relativePath: string
  fileName: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

/**
 * Search file contents for a query string
 */
async function searchFileContents(
  filePath: string,
  query: string,
  queryLower: string
): Promise<ContentSearchResult[]> {
  const results: ContentSearchResult[] = []

  try {
    const stat = await fs.promises.stat(filePath)
    if (stat.size > CONTENT_SEARCH_MAX_FILE_SIZE) return results

    const content = await fs.promises.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const fileName = path.basename(filePath)

    for (let i = 0; i < lines.length && results.length < 5; i++) {
      const line = lines[i]
      const lineLower = line.toLowerCase()
      const matchIndex = lineLower.indexOf(queryLower)

      if (matchIndex !== -1) {
        results.push({
          filePath,
          relativePath: '', // Will be set by caller
          fileName,
          lineNumber: i + 1,
          lineContent: line.slice(0, 200), // Truncate long lines
          matchStart: matchIndex,
          matchEnd: matchIndex + query.length
        })
      }
    }
  } catch {
    // Ignore read errors (binary files, permission issues, etc.)
  }

  return results
}

/**
 * Recursively search directory for content matches
 */
async function searchDirectoryContents(
  dirPath: string,
  basePath: string,
  query: string,
  queryLower: string,
  results: ContentSearchResult[],
  depth: number = 0
): Promise<void> {
  if (depth > FILE_SEARCH_MAX_DEPTH || results.length >= CONTENT_SEARCH_MAX_RESULTS) return

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= CONTENT_SEARCH_MAX_RESULTS) break

      // Skip hidden and excluded directories
      if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.has(entry.name)) continue

      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(basePath, fullPath)

      if (entry.isDirectory()) {
        await searchDirectoryContents(fullPath, basePath, query, queryLower, results, depth + 1)
      } else if (entry.isFile() && isSearchableFile(entry.name)) {
        const fileResults = await searchFileContents(fullPath, query, queryLower)
        for (const result of fileResults) {
          if (results.length >= CONTENT_SEARCH_MAX_RESULTS) break
          result.relativePath = relativePath
          results.push(result)
        }
      }
    }
  } catch {
    // Ignore permission errors
  }
}

// IPC Handler for searching file contents
ipcMain.handle('fs:searchContent', async (_, workspacePath: string, query: string) => {
  if (!query || query.length < 2) {
    return { filenameMatches: [], contentMatches: [] }
  }

  const queryLower = query.toLowerCase()

  // First, get filename matches using existing search
  const filenameMatches: Array<{
    name: string
    path: string
    relativePath: string
    isDirectory: boolean
  }> = []

  const keywords = queryLower.split(/\s+/).filter(k => k.length > 0)
  if (keywords.length > 0) {
    await searchDirectoryRecursively(workspacePath, keywords, filenameMatches)
    sortSearchResults(filenameMatches, keywords)
  }

  // Then, search content
  const contentMatches: ContentSearchResult[] = []
  await searchDirectoryContents(workspacePath, workspacePath, query, queryLower, contentMatches)

  return {
    filenameMatches: filenameMatches.slice(0, 10),
    contentMatches: contentMatches.slice(0, 20)
  }
})
