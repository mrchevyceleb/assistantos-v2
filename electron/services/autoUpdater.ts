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
 */

import { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createLogger } from './logger.js'

const logger = createLogger('AutoUpdater')

// Flag to track if auto-updater should run (disable in dev)
const UPDATER_ENABLED = process.env.NODE_ENV !== 'development'

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

/**
 * Initialize auto-updater
 * Call this from main.ts after app is ready
 */
export async function initAutoUpdater(mainWindow: BrowserWindow): Promise<void> {
  if (!UPDATER_ENABLED) {
    logger.info('Auto-updater not enabled. Install electron-updater to enable.')
    return
  }

  // Uncomment the following when electron-updater is installed:
  /*
  autoUpdater.logger = logger
  autoUpdater.autoDownload = false  // Let user decide

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
    updateStatus.error = error.message
    notifyRenderer(mainWindow, 'update-error', { error: error.message })
    logger.error('Auto-update error:', { error: error.message })
  })

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    checkForUpdates()
  }, 10000)  // Wait 10 seconds after app start
  */
}

/**
 * Check for updates manually
 */
export async function checkForUpdates(): Promise<void> {
  if (!UPDATER_ENABLED) {
    logger.warn('Auto-updater not enabled')
    return
  }

  // Uncomment when electron-updater is installed:
  // await autoUpdater.checkForUpdates()
}

/**
 * Download available update
 */
export async function downloadUpdate(): Promise<void> {
  if (!UPDATER_ENABLED) return

  // Uncomment when electron-updater is installed:
  // await autoUpdater.downloadUpdate()
}

/**
 * Install downloaded update and restart
 */
export function installUpdate(): void {
  if (!UPDATER_ENABLED) return

  // Uncomment when electron-updater is installed:
  // autoUpdater.quitAndInstall()
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
