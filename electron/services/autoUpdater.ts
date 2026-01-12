/**
 * Auto-update service for AssistantOS
 *
 * Configure electron-builder publish settings in package.json:
 * {
 *   "build": {
 *     "publish": [{
 *       "provider": "github",
 *       "owner": "your-username",
 *       "repo": "assistantos"
 *     }]
 *   }
 * }
 *
 * For private repositories, set the GH_TOKEN environment variable
 * or the app will fall back to checking if the repo is public.
 */

import { BrowserWindow, app } from 'electron'
import pkg from 'electron-updater'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger.js'

const { autoUpdater } = pkg

const logger = createLogger('AutoUpdater')

// Flag to track if auto-updater should run (disable in dev)
const UPDATER_ENABLED = process.env.NODE_ENV !== 'development'

/**
 * Get GitHub token from environment or config file
 * Supports: GH_TOKEN, GITHUB_TOKEN env vars, or ~/.assistantos-gh-token file
 */
function getGitHubToken(): string | null {
  // Check environment variables first
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (envToken) {
    logger.info('Using GitHub token from environment variable')
    return envToken
  }

  // Check for token file in user data directory
  try {
    const tokenPath = path.join(app.getPath('userData'), '.gh-token')
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf-8').trim()
      if (token) {
        logger.info('Using GitHub token from config file')
        return token
      }
    }
  } catch (error) {
    logger.debug('No token file found:', { error: (error as Error).message })
  }

  return null
}

interface UpdateStatus {
  checking: boolean
  available: boolean
  downloaded: boolean
  error: string | null
  version: string | null
  progress: number | null
}

let updateStatus: UpdateStatus = {
  checking: false,
  available: false,
  downloaded: false,
  error: null,
  version: null,
  progress: null
}

// Track if GitHub token was configured (for error messages)
let hasGitHubToken = false

/**
 * Initialize auto-updater
 * Call this from main.ts after app is ready
 */
export async function initAutoUpdater(mainWindow: BrowserWindow): Promise<void> {
  if (!UPDATER_ENABLED) {
    logger.info('Auto-updater disabled in development mode')
    return
  }

  // Configure auto-updater for automatic updates
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Explicitly set the feed URL for GitHub releases
  // This ensures we use the correct releases API endpoint
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'mrchevyceleb',
    repo: 'AssistantOS',
    releaseType: 'release'
  })

  logger.info('Auto-updater feed URL configured for GitHub releases')

  // Configure GitHub token for private repository access
  const ghToken = getGitHubToken()
  hasGitHubToken = !!ghToken
  if (ghToken) {
    // Set the token in request headers for GitHub API access
    autoUpdater.requestHeaders = {
      Authorization: `token ${ghToken}`
    }
    logger.info('GitHub token configured for auto-updater')
  } else {
    logger.warn('No GitHub token found - auto-update will only work for public repositories')
    logger.info('To enable updates for private repos: set GH_TOKEN env var or create %APPDATA%/assistantos/.gh-token')
  }

  autoUpdater.on('checking-for-update', () => {
    updateStatus.checking = true
    updateStatus.error = null
    notifyRenderer(mainWindow, 'update-checking')
    logger.info('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    updateStatus.checking = false
    updateStatus.available = true
    updateStatus.version = info.version
    notifyRenderer(mainWindow, 'update-available', { version: info.version })
    logger.info('Update available:', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    updateStatus.checking = false
    updateStatus.available = false
    notifyRenderer(mainWindow, 'update-not-available')
    logger.info('No updates available')
  })

  autoUpdater.on('download-progress', (progress) => {
    updateStatus.progress = progress.percent
    notifyRenderer(mainWindow, 'update-progress', { percent: progress.percent })
    logger.debug('Download progress:', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateStatus.downloaded = true
    updateStatus.progress = 100
    notifyRenderer(mainWindow, 'update-downloaded', { version: info.version })
    logger.info('Update downloaded:', { version: info.version })
  })

  autoUpdater.on('error', (error) => {
    updateStatus.checking = false

    // Provide helpful error message for common issues
    let errorMessage = error.message
    let isSilentError = false

    if (error.message.includes('404') || error.message.includes('Not Found')) {
      // 404 errors are common when no releases exist yet - treat as "no updates available"
      if (!hasGitHubToken) {
        // For public repos without releases, show a friendly message
        errorMessage = 'No updates available yet. Check back later!'
        isSilentError = true
      } else {
        // With token but still 404 - likely no releases published
        errorMessage = 'No releases found. The app will notify you when updates are available.'
        isSilentError = true
      }
      // Don't show as error - treat as "up to date"
      updateStatus.error = null
      notifyRenderer(mainWindow, 'update-not-available')
      logger.info('No releases found on GitHub - treating as up to date')
      return
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Update check failed: GitHub token is invalid or expired. Please update your GH_TOKEN.'
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT') || error.message.includes('network')) {
      errorMessage = 'Unable to check for updates - please check your internet connection.'
      isSilentError = true
    } else if (error.message.includes('Cannot find latest') || error.message.includes('no published releases')) {
      // Another variant of "no releases" error
      updateStatus.error = null
      notifyRenderer(mainWindow, 'update-not-available')
      logger.info('No published releases - treating as up to date')
      return
    }

    if (!isSilentError) {
      updateStatus.error = errorMessage
      notifyRenderer(mainWindow, 'update-error', { error: errorMessage })
      logger.error('Auto-update error:', { error: error.message, friendlyMessage: errorMessage })
    } else {
      // For silent errors, just log but don't show to user
      updateStatus.error = null
      logger.warn('Auto-update check skipped:', { error: error.message, reason: errorMessage })
    }
  })

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    checkForUpdates()
  }, 10000)  // Wait 10 seconds after app start
}

/**
 * Check for updates manually
 */
export async function checkForUpdates(): Promise<void> {
  if (!UPDATER_ENABLED) {
    logger.warn('Auto-updater disabled in development mode')
    return
  }

  await autoUpdater.checkForUpdates()
}

/**
 * Download available update
 */
export async function downloadUpdate(): Promise<void> {
  if (!UPDATER_ENABLED) return

  await autoUpdater.downloadUpdate()
}

/**
 * Install downloaded update and restart
 */
export function installUpdate(): void {
  if (!UPDATER_ENABLED) return

  autoUpdater.quitAndInstall()
}

/**
 * Get current update status
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus }
}

/**
 * Send update notification to renderer
 */
function notifyRenderer(
  mainWindow: BrowserWindow,
  channel: string,
  data?: Record<string, unknown>
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`auto-update:${channel}`, data)
  }
}
