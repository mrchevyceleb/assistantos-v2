/**
 * Sync Store
 *
 * Zustand store for managing cloud sync state in the frontend.
 */

import { create } from 'zustand'

interface SyncConfig {
  syncId: string
  deviceId: string
  enabled: boolean
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  platform: string
  lastSyncAt: string | null
}

interface SyncStatus {
  connected: boolean
  syncing: boolean
  lastSyncAt: string | null
  deviceCount: number
  error: string | null
}

interface SyncDevice {
  id: string
  sync_id: string
  device_name: string | null
  device_type: string
  platform: string | null
  last_seen: string
  created_at: string
}

interface PairingCodeState {
  code: string | null
  expiresAt: string | null
  generating: boolean
}

interface SyncStore {
  // State
  initialized: boolean
  config: SyncConfig | null
  status: SyncStatus
  devices: SyncDevice[]
  pairingCode: PairingCodeState
  linkingCode: string
  linkingError: string | null

  // Actions
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  updateDeviceName: (name: string) => Promise<void>

  // Device linking
  generatePairingCode: () => Promise<string | null>
  linkWithCode: (code: string) => Promise<boolean>
  setLinkingCode: (code: string) => void
  removeDevice: (deviceId: string) => Promise<boolean>
  refreshDevices: () => Promise<void>

  // Sync operations
  pushSettings: (settings: Record<string, unknown>) => Promise<void>
  pullSettings: () => Promise<Record<string, unknown> | null>
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  // Initial state
  initialized: false,
  config: null,
  status: {
    connected: false,
    syncing: false,
    lastSyncAt: null,
    deviceCount: 0,
    error: null
  },
  devices: [],
  pairingCode: {
    code: null,
    expiresAt: null,
    generating: false
  },
  linkingCode: '',
  linkingError: null,

  // Initialize sync service
  initialize: async () => {
    if (!window.electronAPI?.sync) {
      console.warn('[SyncStore] Sync API not available')
      return
    }

    try {
      const result = await window.electronAPI.sync.initialize()
      if (result.success && result.config) {
        set({
          initialized: true,
          config: result.config,
          status: {
            ...get().status,
            connected: true
          }
        })

        // Load devices
        await get().refreshDevices()

        // Set up event listener for real-time updates
        window.electronAPI.sync.onEvent((event) => {
          console.log('[SyncStore] Sync event:', event)
          // Handle real-time sync events
          if (event.type === 'settings_updated') {
            // Could trigger a pull here
          }
        })
      }
    } catch (error) {
      console.error('[SyncStore] Failed to initialize:', error)
      set({
        status: {
          ...get().status,
          error: String(error)
        }
      })
    }
  },

  // Refresh status
  refresh: async () => {
    if (!window.electronAPI?.sync) return

    try {
      const [status, config] = await Promise.all([
        window.electronAPI.sync.getStatus(),
        window.electronAPI.sync.getConfig()
      ])

      set({ status, config })
      await get().refreshDevices()
    } catch (error) {
      console.error('[SyncStore] Failed to refresh:', error)
    }
  },

  // Enable/disable sync
  setEnabled: async (enabled: boolean) => {
    if (!window.electronAPI?.sync) return

    try {
      await window.electronAPI.sync.setEnabled(enabled)
      const config = get().config
      if (config) {
        set({ config: { ...config, enabled } })
      }
    } catch (error) {
      console.error('[SyncStore] Failed to set enabled:', error)
    }
  },

  // Update device name
  updateDeviceName: async (name: string) => {
    if (!window.electronAPI?.sync) return

    try {
      await window.electronAPI.sync.updateDeviceName(name)
      const config = get().config
      if (config) {
        set({ config: { ...config, deviceName: name } })
      }
      await get().refreshDevices()
    } catch (error) {
      console.error('[SyncStore] Failed to update device name:', error)
    }
  },

  // Generate pairing code
  generatePairingCode: async () => {
    if (!window.electronAPI?.sync) return null

    set({
      pairingCode: {
        code: null,
        expiresAt: null,
        generating: true
      }
    })

    try {
      const result = await window.electronAPI.sync.generatePairingCode()
      if (result.success && result.code) {
        set({
          pairingCode: {
            code: result.code,
            expiresAt: result.expiresAt || null,
            generating: false
          }
        })
        return result.code
      } else {
        set({
          pairingCode: {
            code: null,
            expiresAt: null,
            generating: false
          }
        })
        return null
      }
    } catch (error) {
      console.error('[SyncStore] Failed to generate pairing code:', error)
      set({
        pairingCode: {
          code: null,
          expiresAt: null,
          generating: false
        }
      })
      return null
    }
  },

  // Link with pairing code
  linkWithCode: async (code: string) => {
    if (!window.electronAPI?.sync) return false

    set({ linkingError: null })

    try {
      const result = await window.electronAPI.sync.linkWithCode(code)
      if (result.success && result.config) {
        set({
          config: result.config,
          linkingCode: '',
          status: {
            ...get().status,
            connected: true
          }
        })
        await get().refreshDevices()
        return true
      } else {
        set({ linkingError: result.error || 'Failed to link device' })
        return false
      }
    } catch (error) {
      console.error('[SyncStore] Failed to link with code:', error)
      set({ linkingError: String(error) })
      return false
    }
  },

  // Set linking code (for input field)
  setLinkingCode: (code: string) => {
    set({ linkingCode: code.toUpperCase(), linkingError: null })
  },

  // Remove a linked device
  removeDevice: async (deviceId: string) => {
    if (!window.electronAPI?.sync) return false

    try {
      const result = await window.electronAPI.sync.removeDevice(deviceId)
      if (result.success) {
        await get().refreshDevices()
        return true
      }
      return false
    } catch (error) {
      console.error('[SyncStore] Failed to remove device:', error)
      return false
    }
  },

  // Refresh devices list
  refreshDevices: async () => {
    if (!window.electronAPI?.sync) return

    try {
      const result = await window.electronAPI.sync.getLinkedDevices()
      if (result.success) {
        set({
          devices: result.devices,
          status: {
            ...get().status,
            deviceCount: result.devices.length
          }
        })
      }
    } catch (error) {
      console.error('[SyncStore] Failed to refresh devices:', error)
    }
  },

  // Push settings to cloud
  pushSettings: async (settings: Record<string, unknown>) => {
    if (!window.electronAPI?.sync || !get().config?.enabled) return

    try {
      set({ status: { ...get().status, syncing: true } })
      await window.electronAPI.sync.pushSettings(settings)
      set({
        status: {
          ...get().status,
          syncing: false,
          lastSyncAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('[SyncStore] Failed to push settings:', error)
      set({
        status: {
          ...get().status,
          syncing: false,
          error: String(error)
        }
      })
    }
  },

  // Pull settings from cloud
  pullSettings: async () => {
    if (!window.electronAPI?.sync || !get().config?.enabled) return null

    try {
      set({ status: { ...get().status, syncing: true } })
      const result = await window.electronAPI.sync.pullSettings()
      set({ status: { ...get().status, syncing: false } })

      if (result.success && result.settings) {
        return result.settings.settings
      }
      return null
    } catch (error) {
      console.error('[SyncStore] Failed to pull settings:', error)
      set({
        status: {
          ...get().status,
          syncing: false,
          error: String(error)
        }
      })
      return null
    }
  }
}))
