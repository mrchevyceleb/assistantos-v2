/**
 * Cloud Sync Type Definitions
 */

// Sync configuration stored locally
export interface SyncConfig {
  syncId: string          // UUID grouping all user devices
  deviceId: string        // This device's UUID
  secretKey: string       // Encrypted locally via safeStorage
  enabled: boolean
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  platform: string
  lastSyncAt: string | null
}

// Device info returned from server
export interface SyncDevice {
  id: string
  sync_id: string
  device_name: string | null
  device_type: string
  platform: string | null
  last_seen: string
  created_at: string
}

// Sync status for UI
export interface SyncStatus {
  connected: boolean
  syncing: boolean
  lastSyncAt: string | null
  deviceCount: number
  error: string | null
}

// Settings sync payload
export interface SyncSettings {
  sync_id: string
  settings: Record<string, unknown>
  version: number
  updated_at: string
  updated_by: string | null
}

// Conversation sync payload
export interface SyncConversation {
  id: string
  sync_id: string
  conversation_id: string
  agent_id: string | null
  title: string | null
  data: ConversationData
  message_count: number
  created_at: string
  updated_at: string
}

// Conversation data structure
export interface ConversationData {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  model: string
  messages: ConversationMessage[]
  bookmarks: string[]
  workspace: string | null
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
}

// File manifest for workspace sync
export interface FileManifest {
  version: number
  files: Record<string, FileManifestEntry>
}

export interface FileManifestEntry {
  hash: string
  size: number
  modified: string
}

// Pairing code response
export interface PairingCodeResult {
  code: string
  expiresAt: string
}

// Consume pairing code result
export interface ConsumePairingResult {
  success: boolean
  syncId?: string
  secretEncrypted?: string
  error?: string
}

// Sync event types for real-time updates
export type SyncEventType =
  | 'settings_updated'
  | 'conversation_updated'
  | 'conversation_deleted'
  | 'device_connected'
  | 'device_disconnected'
  | 'file_updated'

export interface SyncEvent {
  type: SyncEventType
  payload: unknown
  deviceId: string
  timestamp: string
}
