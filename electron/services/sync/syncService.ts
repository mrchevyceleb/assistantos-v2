/**
 * Cloud Sync Service
 *
 * Core sync coordinator for AssistantOS multi-device sync.
 * Uses Supabase for backend storage with device-based authentication.
 */

import { app, safeStorage } from 'electron'
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { createLogger } from '../logger.js'
import type {
  SyncConfig,
  SyncStatus,
  SyncDevice,
  SyncSettings,
  PairingCodeResult,
  SyncEvent
} from './types.js'

// Supabase credentials (same as memory system)
const SUPABASE_URL = 'https://kvrygtsjobgmrgldwdhw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cnlndHNqb2JnbXJnbGR3ZGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwOTA3MDYsImV4cCI6MjA4MzY2NjcwNn0.nITa5CVrPJO5VkHcAJnjBQLcaLAX5EwdxGaZK7UEm08'

const logger = createLogger('SyncService')

// Singleton instance
let syncService: SyncService | null = null

export class SyncService {
  private supabase: SupabaseClient
  private config: SyncConfig | null = null
  private realtimeChannel: RealtimeChannel | null = null
  private eventListeners: Map<string, ((event: SyncEvent) => void)[]> = new Map()
  private syncStatus: SyncStatus = {
    connected: false,
    syncing: false,
    lastSyncAt: null,
    deviceCount: 0,
    error: null
  }

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  }

  /**
   * Initialize sync service
   * Loads or creates sync config on first launch
   */
  async initialize(): Promise<SyncConfig> {
    logger.info('Initializing sync service...')

    // Load existing config or create new one
    this.config = await this.loadConfig()

    if (!this.config) {
      logger.info('No sync config found, creating new sync identity...')
      this.config = await this.createNewSyncConfig()
      await this.saveConfig(this.config)
    }

    // Register this device with the server
    await this.registerDevice()

    // Update device count
    await this.refreshDeviceCount()

    this.syncStatus.connected = true
    logger.info('Sync service initialized', {
      syncId: this.config.syncId,
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName
    })

    return this.config
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus }
  }

  /**
   * Get current sync config
   */
  getConfig(): SyncConfig | null {
    return this.config ? { ...this.config } : null
  }

  /**
   * Check if sync is enabled
   */
  isEnabled(): boolean {
    return this.config?.enabled ?? false
  }

  /**
   * Enable/disable sync
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.config) return

    this.config.enabled = enabled
    await this.saveConfig(this.config)

    if (enabled) {
      await this.subscribeToRealtime()
    } else {
      await this.unsubscribeFromRealtime()
    }

    logger.info(`Sync ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Update device name
   */
  async updateDeviceName(name: string): Promise<void> {
    if (!this.config) return

    this.config.deviceName = name
    await this.saveConfig(this.config)
    await this.registerDevice()

    logger.info('Device name updated', { name })
  }

  // ==========================================================================
  // Device Linking
  // ==========================================================================

  /**
   * Generate a pairing code for linking another device
   */
  async generatePairingCode(): Promise<PairingCodeResult> {
    if (!this.config) {
      throw new Error('Sync not initialized')
    }

    // Encrypt the secret for transmission
    const secretEncrypted = this.encryptSecret(this.config.secretKey)

    // Call the database function to generate a unique code
    const { data, error } = await this.supabase.rpc('generate_pairing_code', {
      p_sync_id: this.config.syncId,
      p_secret_encrypted: secretEncrypted,
      p_ttl_minutes: 5
    })

    if (error) {
      logger.error('Failed to generate pairing code', { error: error.message, code: error.code })
      throw new Error('Failed to generate pairing code')
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    logger.info('Pairing code generated', { code: data })

    return {
      code: data as string,
      expiresAt
    }
  }

  /**
   * Link this device using a pairing code from another device
   */
  async linkWithCode(code: string): Promise<boolean> {
    logger.info('Attempting to link with code', { code })

    // Consume the pairing code
    const { data, error } = await this.supabase.rpc('consume_pairing_code', {
      p_code: code.toUpperCase()
    })

    if (error) {
      logger.error('Failed to consume pairing code', { error: error.message, code: error.code })
      return false
    }

    const result = data as Array<{ sync_id: string; secret_encrypted: string; success: boolean; error: string | null }>
    if (!result || result.length === 0 || !result[0].success) {
      logger.error('Invalid or expired pairing code')
      return false
    }

    const { sync_id: syncId, secret_encrypted: secretEncrypted } = result[0]

    // Decrypt the secret
    const secretKey = this.decryptSecret(secretEncrypted)

    // Create new config with the linked sync_id
    this.config = {
      syncId: syncId,
      deviceId: crypto.randomUUID(),
      secretKey,
      enabled: true,
      deviceName: this.generateDeviceName(),
      deviceType: 'desktop',
      platform: process.platform,
      lastSyncAt: null
    }

    await this.saveConfig(this.config)
    await this.registerDevice()
    await this.refreshDeviceCount()

    this.syncStatus.connected = true
    logger.info('Device linked successfully', { syncId })

    return true
  }

  /**
   * Get all linked devices
   */
  async getLinkedDevices(): Promise<SyncDevice[]> {
    if (!this.config) return []

    const { data, error } = await this.supabase
      .from('sync_devices')
      .select('*')
      .eq('sync_id', this.config.syncId)
      .order('last_seen', { ascending: false })

    if (error) {
      logger.error('Failed to get linked devices', { error: error.message, code: error.code })
      return []
    }

    return data as SyncDevice[]
  }

  /**
   * Remove a linked device
   */
  async removeDevice(deviceId: string): Promise<boolean> {
    if (!this.config) return false

    // Don't allow removing current device
    if (deviceId === this.config.deviceId) {
      logger.warn('Cannot remove current device')
      return false
    }

    const { error } = await this.supabase
      .from('sync_devices')
      .delete()
      .eq('id', deviceId)
      .eq('sync_id', this.config.syncId)

    if (error) {
      logger.error('Failed to remove device', { error: error.message, code: error.code })
      return false
    }

    await this.refreshDeviceCount()
    logger.info('Device removed', { deviceId })
    return true
  }

  // ==========================================================================
  // Settings Sync
  // ==========================================================================

  /**
   * Push settings to cloud
   */
  async pushSettings(settings: Record<string, unknown>): Promise<void> {
    if (!this.config || !this.config.enabled) return

    const { error } = await this.supabase
      .from('sync_settings')
      .upsert({
        sync_id: this.config.syncId,
        settings,
        updated_at: new Date().toISOString(),
        updated_by: this.config.deviceId
      }, {
        onConflict: 'sync_id'
      })

    if (error) {
      logger.error('Failed to push settings', { error: error.message, code: error.code })
      throw error
    }

    this.config.lastSyncAt = new Date().toISOString()
    this.syncStatus.lastSyncAt = this.config.lastSyncAt
    await this.saveConfig(this.config)

    logger.debug('Settings pushed to cloud')
  }

  /**
   * Pull settings from cloud
   */
  async pullSettings(): Promise<SyncSettings | null> {
    if (!this.config || !this.config.enabled) return null

    const { data, error } = await this.supabase
      .from('sync_settings')
      .select('*')
      .eq('sync_id', this.config.syncId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No settings exist yet
        return null
      }
      logger.error('Failed to pull settings', { error: error.message, code: error.code })
      return null
    }

    return data as SyncSettings
  }

  // ==========================================================================
  // Conversation Sync
  // ==========================================================================

  /**
   * Push a conversation to cloud
   */
  async pushConversation(conversationId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.config || !this.config.enabled) return

    const { error } = await this.supabase
      .from('sync_conversations')
      .upsert({
        sync_id: this.config.syncId,
        conversation_id: conversationId,
        agent_id: (data as any).agentId || null,
        title: (data as any).title || null,
        data,
        message_count: (data as any).messages?.length || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'sync_id,conversation_id'
      })

    if (error) {
      logger.error('Failed to push conversation', { error: error.message, code: error.code })
      throw error
    }

    logger.debug('Conversation pushed', { conversationId })
  }

  /**
   * Pull all conversations from cloud
   */
  async pullConversations(): Promise<Array<{ conversation_id: string; data: Record<string, unknown>; updated_at: string }>> {
    if (!this.config || !this.config.enabled) return []

    const { data, error } = await this.supabase
      .from('sync_conversations')
      .select('conversation_id, data, updated_at')
      .eq('sync_id', this.config.syncId)
      .order('updated_at', { ascending: false })

    if (error) {
      logger.error('Failed to pull conversations', { error: error.message, code: error.code })
      return []
    }

    return data as Array<{ conversation_id: string; data: Record<string, unknown>; updated_at: string }>
  }

  /**
   * Delete a conversation from cloud
   */
  async deleteConversation(conversationId: string): Promise<void> {
    if (!this.config || !this.config.enabled) return

    const { error } = await this.supabase
      .from('sync_conversations')
      .delete()
      .eq('sync_id', this.config.syncId)
      .eq('conversation_id', conversationId)

    if (error) {
      logger.error('Failed to delete conversation', { error: error.message, code: error.code })
    }

    logger.debug('Conversation deleted from cloud', { conversationId })
  }

  // ==========================================================================
  // Realtime Subscriptions
  // ==========================================================================

  /**
   * Subscribe to real-time sync updates
   */
  async subscribeToRealtime(): Promise<void> {
    if (!this.config || this.realtimeChannel) return

    this.realtimeChannel = this.supabase
      .channel(`sync:${this.config.syncId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_settings',
          filter: `sync_id=eq.${this.config.syncId}`
        },
        (payload) => {
          // Don't process own updates
          if ((payload.new as any)?.updated_by === this.config?.deviceId) return

          this.emitEvent({
            type: 'settings_updated',
            payload: payload.new,
            deviceId: (payload.new as any)?.updated_by || 'unknown',
            timestamp: new Date().toISOString()
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_conversations',
          filter: `sync_id=eq.${this.config.syncId}`
        },
        (payload) => {
          const eventType = payload.eventType === 'DELETE'
            ? 'conversation_deleted'
            : 'conversation_updated'

          this.emitEvent({
            type: eventType,
            payload: payload.new || payload.old,
            deviceId: 'unknown',
            timestamp: new Date().toISOString()
          })
        }
      )
      .subscribe()

    logger.info('Subscribed to realtime sync updates')
  }

  /**
   * Unsubscribe from real-time updates
   */
  async unsubscribeFromRealtime(): Promise<void> {
    if (this.realtimeChannel) {
      await this.supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
      logger.info('Unsubscribed from realtime sync updates')
    }
  }

  /**
   * Add event listener
   */
  on(eventType: string, callback: (event: SyncEvent) => void): void {
    const listeners = this.eventListeners.get(eventType) || []
    listeners.push(callback)
    this.eventListeners.set(eventType, listeners)
  }

  /**
   * Remove event listener
   */
  off(eventType: string, callback: (event: SyncEvent) => void): void {
    const listeners = this.eventListeners.get(eventType) || []
    const index = listeners.indexOf(callback)
    if (index !== -1) {
      listeners.splice(index, 1)
      this.eventListeners.set(eventType, listeners)
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Cleanup sync service
   */
  async cleanup(): Promise<void> {
    await this.unsubscribeFromRealtime()
    this.syncStatus.connected = false
    logger.info('Sync service cleaned up')
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getConfigPath(): string {
    return path.join(app.getPath('userData'), 'sync-config.json')
  }

  private async loadConfig(): Promise<SyncConfig | null> {
    try {
      const configPath = this.getConfigPath()
      if (!fs.existsSync(configPath)) return null

      const encrypted = fs.readFileSync(configPath)

      // Decrypt if safeStorage is available
      let configStr: string
      if (safeStorage.isEncryptionAvailable()) {
        configStr = safeStorage.decryptString(encrypted)
      } else {
        configStr = encrypted.toString('utf-8')
      }

      return JSON.parse(configStr) as SyncConfig
    } catch (error) {
      logger.error('Failed to load sync config', { error: (error as Error).message })
      return null
    }
  }

  private async saveConfig(config: SyncConfig): Promise<void> {
    try {
      const configPath = this.getConfigPath()
      const configStr = JSON.stringify(config, null, 2)

      // Encrypt if safeStorage is available
      let data: Buffer
      if (safeStorage.isEncryptionAvailable()) {
        data = safeStorage.encryptString(configStr)
      } else {
        data = Buffer.from(configStr, 'utf-8')
      }

      fs.writeFileSync(configPath, data)
    } catch (error) {
      logger.error('Failed to save sync config', { error: (error as Error).message })
    }
  }

  private async createNewSyncConfig(): Promise<SyncConfig> {
    return {
      syncId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      secretKey: crypto.randomBytes(32).toString('base64'),
      enabled: true,
      deviceName: this.generateDeviceName(),
      deviceType: 'desktop',
      platform: process.platform,
      lastSyncAt: null
    }
  }

  private generateDeviceName(): string {
    const hostname = os.hostname() || 'Device'
    const platformNames: Record<string, string> = {
      win32: 'Windows',
      darwin: 'Mac',
      linux: 'Linux'
    }
    const platform = platformNames[process.platform] || 'Desktop'
    return `${hostname}-${platform}`
  }

  private async registerDevice(): Promise<void> {
    if (!this.config) return

    const { data, error } = await this.supabase.rpc('register_device', {
      p_sync_id: this.config.syncId,
      p_device_id: this.config.deviceId,
      p_device_name: this.config.deviceName,
      p_device_type: this.config.deviceType,
      p_platform: this.config.platform
    })

    if (error) {
      logger.error('Failed to register device', { error: error.message, code: error.code })
      // Non-fatal, continue anyway
    } else {
      // Update device ID if server assigned a new one
      if (data && data !== this.config.deviceId) {
        this.config.deviceId = data
        await this.saveConfig(this.config)
      }
    }
  }

  private async refreshDeviceCount(): Promise<void> {
    if (!this.config) return

    const { count, error } = await this.supabase
      .from('sync_devices')
      .select('*', { count: 'exact', head: true })
      .eq('sync_id', this.config.syncId)

    if (!error && count !== null) {
      this.syncStatus.deviceCount = count
    }
  }

  private encryptSecret(secret: string): string {
    // Simple base64 encoding for transmission (actual security is via HTTPS + RLS)
    // Could add AES encryption layer here for extra security
    return Buffer.from(secret).toString('base64')
  }

  private decryptSecret(encrypted: string): string {
    return Buffer.from(encrypted, 'base64').toString('utf-8')
  }

  private emitEvent(event: SyncEvent): void {
    const listeners = this.eventListeners.get(event.type) || []
    listeners.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        logger.error('Event listener error', { error: (error as Error).message })
      }
    })

    // Also emit to 'all' listeners
    const allListeners = this.eventListeners.get('all') || []
    allListeners.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        logger.error('Event listener error', { error: (error as Error).message })
      }
    })
  }
}

// ==========================================================================
// Singleton Access
// ==========================================================================

export function getSyncService(): SyncService {
  if (!syncService) {
    syncService = new SyncService()
  }
  return syncService
}

export async function initializeSyncService(): Promise<SyncConfig> {
  const service = getSyncService()
  return service.initialize()
}

export async function cleanupSyncService(): Promise<void> {
  if (syncService) {
    await syncService.cleanup()
    syncService = null
  }
}
