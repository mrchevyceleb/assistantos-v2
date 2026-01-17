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
 *
 * [Bug Fix] All update errors are now reported to users - no silent failures.
 * Error messages provide actionable guidance (check connection, verify releases exist, etc.)
 */

import { BrowserWindow, app } from 'electron'
import pkg from 'electron-updater'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger.js'

const { autoUpdater } = pkg

const logger = createLogger('AutoUpdater')

// Flag to track if auto-updater should run (disable in dev)
// Use app.isPackaged for reliable detection - NODE_ENV is not always set correctly
const UPDATER_ENABLED = app.isPackaged

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
  logger.info('Initializing auto-updater...', {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    updaterEnabled: UPDATER_ENABLED
  })

  if (!UPDATER_ENABLED) {
    logger.info('Auto-updater disabled - running in development mode (app not packaged)')
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

  logger.info('Auto-updater feed URL configured for GitHub releases', {
    currentVersion: app.getVersion()
  })

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

    // [Bug Fix] Always show errors to users - no more silent failures
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      // 404 errors are common when no releases exist yet
      if (!hasGitHubToken) {
        // For public repos without releases, show a friendly message
        errorMessage = 'No releases published yet. You\'re running the latest available version. Check GitHub for future releases.'
      } else {
        // With token but still 404 - likely no releases published
        errorMessage = 'No releases found in the repository. You may be running an unreleased development version.'
      }
      // Treat as "no updates available" but SHOW the message
      updateStatus.error = errorMessage
      notifyRenderer(mainWindow, 'update-error', { error: errorMessage })
      logger.info('No releases found on GitHub:', { error: error.message, userMessage: errorMessage })
      return
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Update check failed: GitHub token is invalid or expired. Please update your GH_TOKEN environment variable.'
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT') || error.message.includes('network')) {
      errorMessage = 'Unable to check for updates - please check your internet connection and try again.'
    } else if (error.message.includes('Cannot find latest') || error.message.includes('no published releases')) {
      // Another variant of "no releases" error
      errorMessage = 'No published releases found. You may be running the latest development version.'
    } else {
      // Generic error - provide actionable guidance
      errorMessage = `Update check failed: ${error.message}. Please check the logs or try again later.`
    }

    // [Bug Fix] Always notify users of errors - no silent failures
    updateStatus.error = errorMessage
    notifyRenderer(mainWindow, 'update-error', { error: errorMessage })
    logger.error('Auto-update error:', {
      error: error.message,
      userMessage: errorMessage,
      hasGitHubToken
    })
  })

  // Check for updates on startup (after a delay)
  setTimeout(async () => {
    try {
      await checkForUpdates()
    } catch (error) {
      // Error is already logged and handled via error event
      logger.debug('Startup update check failed (error already handled):', { error: (error as Error).message })
    }
  }, 10000)  // Wait 10 seconds after app start
}

/**
 * Check for updates manually
 * Wraps electron-updater's checkForUpdates() with proper error handling
 */
export async function checkForUpdates(): Promise<void> {
  if (!UPDATER_ENABLED) {
    logger.warn('Auto-updater disabled - app is not packaged (development mode)')
    throw new Error('Auto-updater is disabled in development mode')
  }

  logger.info('Initiating update check...')

  // [Bug Fix] Wrap the update check in a promise that resolves when we get a definitive answer
  // electron-updater emits events but doesn't always reject/resolve the promise properly
  return new Promise((resolve, reject) => {
    let completed = false

    // Success handlers
    const onAvailable = () => {
      if (!completed) {
        completed = true
        cleanup()
        logger.info('Update available - resolving check')
        resolve()
      }
    }

    const onNotAvailable = () => {
      if (!completed) {
        completed = true
        cleanup()
        logger.info('No updates available - resolving check')
        resolve()
      }
    }

    // Error handler
    const onError = (error: Error) => {
      if (!completed) {
        completed = true
        cleanup()
        logger.error('Update check error - rejecting check:', { error: error.message })
        reject(error)
      }
    }

    // Cleanup function to remove listeners
    const cleanup = () => {
      autoUpdater.removeListener('update-available', onAvailable)
      autoUpdater.removeListener('update-not-available', onNotAvailable)
      autoUpdater.removeListener('error', onError)
    }

    // Attach listeners
    autoUpdater.once('update-available', onAvailable)
    autoUpdater.once('update-not-available', onNotAvailable)
    autoUpdater.once('error', onError)

    // Initiate the check
    autoUpdater.checkForUpdates()
      .then((result) => {
        // If the promise resolves but we haven't completed yet, treat as success
        if (!completed) {
          logger.info('Update check completed via promise resolution', {
            updateInfo: result?.updateInfo?.version,
            cancellationToken: !!result?.cancellationToken
          })
        }
      })
      .catch((error) => {
        // If the promise rejects but we haven't completed yet, treat as error
        if (!completed) {
          completed = true
          cleanup()
          logger.error('checkForUpdates threw an error:', { error: error.message })
          reject(error)
        }
      })
  })
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
