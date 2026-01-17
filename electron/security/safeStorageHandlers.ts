/**
 * Secure Credential Storage using Electron safeStorage
 *
 * Provides encrypted storage for sensitive credentials like API keys and OAuth tokens.
 * On Windows: Uses DPAPI (Data Protection API)
 * On macOS: Uses Keychain
 * On Linux: Uses libsecret
 */

import { ipcMain, safeStorage } from 'electron'

/**
 * Credential keys used for storage
 */
export enum CredentialKey {
  ANTHROPIC_API_KEY = 'anthropic_api_key',
  OPENAI_API_KEY = 'openai_api_key',
  GMAIL_TOKENS_PREFIX = 'gmail_tokens_',
  CALENDAR_TOKENS = 'calendar_tokens',
  INTEGRATION_TOKENS_PREFIX = 'integration_tokens_',
}

/**
 * In-memory cache of encrypted credentials
 * Maps credential key to encrypted buffer
 */
const credentialCache = new Map<string, Buffer>()

/**
 * Check if safeStorage is available on this platform
 */
export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * Register IPC handlers for secure credential storage
 */
export function registerSafeStorageHandlers(): void {
  // Check if safeStorage is available
  ipcMain.handle('safeStorage:isAvailable', () => {
    return isSafeStorageAvailable()
  })

  // Store a credential securely
  ipcMain.handle('safeStorage:setCredential', (_event, key: string, value: string) => {
    try {
      if (!isSafeStorageAvailable()) {
        throw new Error('Safe storage is not available on this platform')
      }

      // Encrypt the credential
      const encrypted = safeStorage.encryptString(value)

      // Store in memory cache (in production, you might want to persist to disk)
      credentialCache.set(key, encrypted)

      return { success: true }
    } catch (error) {
      console.error('Error storing credential:', error)
      return { success: false, error: String(error) }
    }
  })

  // Retrieve a credential securely
  ipcMain.handle('safeStorage:getCredential', (_event, key: string) => {
    try {
      if (!isSafeStorageAvailable()) {
        throw new Error('Safe storage is not available on this platform')
      }

      const encrypted = credentialCache.get(key)
      if (!encrypted) {
        return { success: true, value: null }
      }

      // Decrypt the credential
      const decrypted = safeStorage.decryptString(encrypted)

      return { success: true, value: decrypted }
    } catch (error) {
      console.error('Error retrieving credential:', error)
      return { success: false, error: String(error) }
    }
  })

  // Delete a credential
  ipcMain.handle('safeStorage:deleteCredential', (_event, key: string) => {
    try {
      credentialCache.delete(key)
      return { success: true }
    } catch (error) {
      console.error('Error deleting credential:', error)
      return { success: false, error: String(error) }
    }
  })

  // List all credential keys (for migration/debugging)
  ipcMain.handle('safeStorage:listKeys', () => {
    try {
      return { success: true, keys: Array.from(credentialCache.keys()) }
    } catch (error) {
      console.error('Error listing credential keys:', error)
      return { success: false, error: String(error) }
    }
  })
}

/**
 * Cleanup safeStorage handlers
 */
export function cleanupSafeStorageHandlers(): void {
  ipcMain.removeHandler('safeStorage:isAvailable')
  ipcMain.removeHandler('safeStorage:setCredential')
  ipcMain.removeHandler('safeStorage:getCredential')
  ipcMain.removeHandler('safeStorage:deleteCredential')
  ipcMain.removeHandler('safeStorage:listKeys')
}
