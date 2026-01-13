/**
 * Sync Service IPC Handlers
 *
 * Exposes sync functionality to the renderer process via IPC.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getSyncService, initializeSyncService, cleanupSyncService } from './syncService.js'
import { createLogger } from '../logger.js'
import type { SyncEvent } from './types.js'

const logger = createLogger('SyncIPC')

let mainWindow: BrowserWindow | null = null

/**
 * Register all sync-related IPC handlers
 */
export function registerSyncHandlers(window: BrowserWindow | null): void {
  mainWindow = window
  logger.info('Registering sync IPC handlers...')

  // Initialize sync service
  ipcMain.handle('sync:initialize', async () => {
    try {
      const config = await initializeSyncService()

      // Set up event forwarding to renderer
      const service = getSyncService()
      service.on('all', (event: SyncEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:event', event)
        }
      })

      // Start realtime if enabled
      if (config.enabled) {
        await service.subscribeToRealtime()
      }

      return { success: true, config }
    } catch (error) {
      logger.error('Failed to initialize sync', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Get sync status
  ipcMain.handle('sync:getStatus', () => {
    const service = getSyncService()
    return service.getStatus()
  })

  // Get sync config
  ipcMain.handle('sync:getConfig', () => {
    const service = getSyncService()
    return service.getConfig()
  })

  // Enable/disable sync
  ipcMain.handle('sync:setEnabled', async (_, enabled: boolean) => {
    try {
      const service = getSyncService()
      await service.setEnabled(enabled)
      return { success: true }
    } catch (error) {
      logger.error('Failed to set sync enabled', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Update device name
  ipcMain.handle('sync:updateDeviceName', async (_, name: string) => {
    try {
      const service = getSyncService()
      await service.updateDeviceName(name)
      return { success: true }
    } catch (error) {
      logger.error('Failed to update device name', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // ==========================================================================
  // Device Linking
  // ==========================================================================

  // Generate pairing code
  ipcMain.handle('sync:generatePairingCode', async () => {
    try {
      const service = getSyncService()
      const result = await service.generatePairingCode()
      return { success: true, ...result }
    } catch (error) {
      logger.error('Failed to generate pairing code', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Link with pairing code
  ipcMain.handle('sync:linkWithCode', async (_, code: string) => {
    try {
      const service = getSyncService()
      const success = await service.linkWithCode(code)
      if (success) {
        return { success: true, config: service.getConfig() }
      }
      return { success: false, error: 'Invalid or expired pairing code' }
    } catch (error) {
      logger.error('Failed to link with code', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Get linked devices
  ipcMain.handle('sync:getLinkedDevices', async () => {
    try {
      const service = getSyncService()
      const devices = await service.getLinkedDevices()
      return { success: true, devices }
    } catch (error) {
      logger.error('Failed to get linked devices', { error: (error as Error).message })
      return { success: false, error: String(error), devices: [] }
    }
  })

  // Remove a linked device
  ipcMain.handle('sync:removeDevice', async (_, deviceId: string) => {
    try {
      const service = getSyncService()
      const success = await service.removeDevice(deviceId)
      return { success }
    } catch (error) {
      logger.error('Failed to remove device', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // ==========================================================================
  // Settings Sync
  // ==========================================================================

  // Push settings
  ipcMain.handle('sync:pushSettings', async (_, settings: Record<string, unknown>) => {
    try {
      const service = getSyncService()
      await service.pushSettings(settings)
      return { success: true }
    } catch (error) {
      logger.error('Failed to push settings', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Pull settings
  ipcMain.handle('sync:pullSettings', async () => {
    try {
      const service = getSyncService()
      const settings = await service.pullSettings()
      return { success: true, settings }
    } catch (error) {
      logger.error('Failed to pull settings', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // ==========================================================================
  // Conversation Sync
  // ==========================================================================

  // Push conversation
  ipcMain.handle('sync:pushConversation', async (_, conversationId: string, data: Record<string, unknown>) => {
    try {
      const service = getSyncService()
      await service.pushConversation(conversationId, data)
      return { success: true }
    } catch (error) {
      logger.error('Failed to push conversation', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  // Pull conversations
  ipcMain.handle('sync:pullConversations', async () => {
    try {
      const service = getSyncService()
      const conversations = await service.pullConversations()
      return { success: true, conversations }
    } catch (error) {
      logger.error('Failed to pull conversations', { error: (error as Error).message })
      return { success: false, error: String(error), conversations: [] }
    }
  })

  // Delete conversation
  ipcMain.handle('sync:deleteConversation', async (_, conversationId: string) => {
    try {
      const service = getSyncService()
      await service.deleteConversation(conversationId)
      return { success: true }
    } catch (error) {
      logger.error('Failed to delete conversation', { error: (error as Error).message })
      return { success: false, error: String(error) }
    }
  })

  logger.info('Sync IPC handlers registered')
}

/**
 * Cleanup sync handlers
 */
export async function cleanupSyncHandlers(): Promise<void> {
  await cleanupSyncService()

  // Remove all handlers
  const handlers = [
    'sync:initialize',
    'sync:getStatus',
    'sync:getConfig',
    'sync:setEnabled',
    'sync:updateDeviceName',
    'sync:generatePairingCode',
    'sync:linkWithCode',
    'sync:getLinkedDevices',
    'sync:removeDevice',
    'sync:pushSettings',
    'sync:pullSettings',
    'sync:pushConversation',
    'sync:pullConversations',
    'sync:deleteConversation'
  ]

  handlers.forEach(handler => {
    ipcMain.removeHandler(handler)
  })

  logger.info('Sync IPC handlers cleaned up')
}
