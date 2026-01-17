/**
 * MCP IPC Handlers
 * Bridge between renderer process and MCP Manager
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getMCPManager } from './MCPManager.js';
import {
  getMentionMap,
  getAllMentions,
  getAllIntegrations,
  getCustomIntegrations,
  registerCustomIntegration,
  unregisterCustomIntegration,
  updateCustomIntegration,
  loadCustomIntegrations,
  MCPIntegration,
  getIntegration,
  createGmailAccountIntegration
} from './registry.js';
import { startGoogleOAuthWithAutoConfig, refreshGoogleToken } from './oauth.js';
import { GOOGLE_OAUTH_CREDENTIALS } from '../config/googleOAuth.js';
import type { MCPManager } from './MCPManager.js';
import { updateCredentialsFile, type GmailOAuthTokens } from './gmailCredentialManager.js';
import { getCalendarEnvVars, updateTokensFile as updateCalendarTokens, type CalendarOAuthTokens } from './calendarCredentialManager.js';

/**
 * Token refresh lock mechanism to prevent race conditions
 * Maps integrationId -> Promise of ongoing refresh operation
 */
const tokenRefreshLocks = new Map<string, Promise<void>>();

/**
 * Fetch Gmail email address using access token
 */
async function fetchGmailEmailAddress(accessToken: string): Promise<string> {
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.statusText}`);
    }

    const data = await response.json() as { emailAddress?: string };
    return data.emailAddress || 'Unknown';
  } catch (error) {
    console.error('[Gmail] Failed to fetch email address:', error);
    return 'Unknown';
  }
}

/**
 * Internal function that performs the actual token refresh
 * Called only when a lock is acquired
 */
async function performTokenRefresh(integrationId: string, manager: MCPManager): Promise<void> {
  const envVars = manager.getEnvVars(integrationId) || {};

  const refreshToken = envVars['GOOGLE_REFRESH_TOKEN'];
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const config = {
    clientId: GOOGLE_OAUTH_CREDENTIALS.clientId,
    clientSecret: GOOGLE_OAUTH_CREDENTIALS.clientSecret
  };

  const refreshed = await refreshGoogleToken(refreshToken, config);

  // Update env vars with new token
  envVars['GOOGLE_ACCESS_TOKEN'] = refreshed.accessToken;
  envVars['GOOGLE_TOKEN_EXPIRES_AT'] = refreshed.expiresAt.toString();
  manager.setEnvVars(integrationId, envVars);

  // Update credential files for Gmail accounts
  const integration = getIntegration(integrationId);
  if (integration?.isGmailAccount && integration.gmailAccountId) {
    const gmailTokens: GmailOAuthTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshToken,
      expiresAt: refreshed.expiresAt
    };
    updateCredentialsFile(integration.gmailAccountId, gmailTokens);
    console.log(`[OAuth] Updated credential files for ${integrationId}`);
  }

  // Update tokens file for Calendar
  if (integrationId === 'calendar') {
    const calendarTokens: CalendarOAuthTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshToken,
      expiresAt: refreshed.expiresAt
    };
    updateCalendarTokens(calendarTokens);
    console.log(`[OAuth] Updated tokens file for calendar`);
  }

  console.log(`[OAuth] Token refreshed for ${integrationId}`);

  // Restart server to use new token
  const isRunning = manager.isServerReady(integrationId);
  if (isRunning) {
    await manager.stopServer(integrationId);
    await manager.startServer(integrationId);
    console.log(`[OAuth] Restarted ${integrationId} with fresh token`);
  }
}

/**
 * Check and refresh OAuth tokens if needed (for Google integrations)
 * Uses a mutex/lock to prevent race conditions when multiple parallel
 * tool executions detect token expiry simultaneously
 */
async function refreshOAuthTokenIfNeeded(integrationId: string, manager: MCPManager): Promise<void> {
  const envVars = manager.getEnvVars(integrationId) || {};
  const expiresAtStr = envVars['GOOGLE_TOKEN_EXPIRES_AT'];

  if (!expiresAtStr) return; // No expiration info

  const expiresAt = parseInt(expiresAtStr, 10);
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // Refresh 5 minutes before expiry

  if (expiresAt > now + bufferTime) return; // Token still valid

  // Check if there's already a refresh in progress for this integration
  const existingRefresh = tokenRefreshLocks.get(integrationId);
  if (existingRefresh) {
    console.log(`[OAuth] Refresh already in progress for ${integrationId}, waiting...`);
    await existingRefresh;
    return;
  }

  console.log(`[OAuth] Token expiring soon for ${integrationId}, refreshing...`);

  // Create a new refresh promise and store it in the lock
  const refreshPromise = performTokenRefresh(integrationId, manager)
    .finally(() => {
      // Always release the lock when done (success or failure)
      tokenRefreshLocks.delete(integrationId);
    });

  tokenRefreshLocks.set(integrationId, refreshPromise);

  try {
    await refreshPromise;
  } catch (error) {
    console.error(`[OAuth] Failed to refresh token for ${integrationId}:`, error);
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Register all MCP-related IPC handlers
 */
export function registerMCPHandlers(mainWindow: BrowserWindow | null = null): void {
  const manager = getMCPManager(mainWindow || undefined);

  // Get all integrations from registry (built-in + custom)
  ipcMain.handle('mcp:getIntegrations', () => {
    return getAllIntegrations();
  });

  // Get mention map (mention → integrationId)
  ipcMain.handle('mcp:getMentionMap', () => {
    return getMentionMap();
  });

  // Get all mentions for autocomplete
  ipcMain.handle('mcp:getAllMentions', () => {
    return getAllMentions();
  });

  // Configure environment variables for an integration
  ipcMain.handle('mcp:configure', async (_event, integrationId: string, config: Record<string, string>) => {
    try {
      manager.setEnvVars(integrationId, config);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Start an integration
  ipcMain.handle('mcp:start', async (_event, integrationId: string) => {
    try {
      await manager.startServer(integrationId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Stop an integration
  ipcMain.handle('mcp:stop', async (_event, integrationId: string) => {
    try {
      await manager.stopServer(integrationId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Check if integration is ready
  ipcMain.handle('mcp:isReady', (_event, integrationId: string) => {
    return manager.isServerReady(integrationId);
  });

  // Get tools for specific integrations
  ipcMain.handle('mcp:getTools', async (_event, integrationIds: string[]) => {
    return manager.getToolsForIntegrations(integrationIds);
  });

  // Execute an MCP tool
  ipcMain.handle('mcp:executeTool', async (_event, integrationId: string, toolName: string, input: Record<string, unknown>) => {
    try {
      // Check and refresh OAuth tokens for Google integrations
      if (integrationId.startsWith('gmail') || integrationId.startsWith('calendar')) {
        await refreshOAuthTokenIfNeeded(integrationId, manager);
      }

      return await manager.executeTool(integrationId, toolName, input);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Find which integration a tool belongs to
  ipcMain.handle('mcp:findIntegrationForTool', (_event, toolName: string) => {
    return manager.findIntegrationForTool(toolName);
  });

  // Get status of all integrations
  ipcMain.handle('mcp:getStatus', () => {
    return manager.getStatus();
  });

  // Get configured env vars for an integration (for UI display)
  ipcMain.handle('mcp:getConfig', (_event, integrationId: string) => {
    return manager.getEnvVars(integrationId) || {};
  });

  // Pre-start all enabled integrations (Claude Code-like behavior)
  ipcMain.handle('mcp:preStartEnabled', async (
    _event,
    configs: Record<string, { enabled: boolean; envVars: Record<string, string> }>
  ) => {
    try {
      await manager.preStartEnabled(configs);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // ============================================
  // Custom Integration Handlers
  // ============================================

  // Get custom integrations only
  ipcMain.handle('mcp:getCustomIntegrations', () => {
    return getCustomIntegrations();
  });

  // Register a new custom integration
  ipcMain.handle('mcp:registerCustomIntegration', (_event, integration: MCPIntegration) => {
    return registerCustomIntegration(integration);
  });

  // Unregister a custom integration
  ipcMain.handle('mcp:unregisterCustomIntegration', async (_event, integrationId: string) => {
    // Stop the server first if running
    try {
      await manager.stopServer(integrationId);
    } catch {
      // Ignore errors if not running
    }
    return unregisterCustomIntegration(integrationId);
  });

  // Update a custom integration
  ipcMain.handle('mcp:updateCustomIntegration', (_event, id: string, updates: Partial<MCPIntegration>) => {
    return updateCustomIntegration(id, updates);
  });

  // Load custom integrations from persistence (called on app startup)
  ipcMain.handle('mcp:loadCustomIntegrations', (_event, integrations: MCPIntegration[]) => {
    loadCustomIntegrations(integrations);
    return { success: true };
  });

  // ============================================
  // OAuth Handlers
  // ============================================

  // Start OAuth flow for Google integrations
  ipcMain.handle('mcp:startOAuth', async (_event, integrationId: string) => {
    try {
      const integration = getIntegration(integrationId);
      if (!integration) {
        return { success: false, error: `Unknown integration: ${integrationId}` };
      }

      if (!integration.oauth || integration.oauth.provider !== 'google') {
        return { success: false, error: `Integration ${integrationId} does not support OAuth` };
      }

      // Determine service type based on integration ID
      const service = integrationId === 'gmail' ? 'gmail' : 'calendar';

      // Get user-configured credentials if any (for future use)
      const userCredentials = manager.getEnvVars(integrationId);

      // Start OAuth flow
      const result = await startGoogleOAuthWithAutoConfig(service, mainWindow, {
        clientId: userCredentials?.['GMAIL_CLIENT_ID'] || userCredentials?.['GOOGLE_CLIENT_ID'],
        clientSecret: userCredentials?.['GMAIL_CLIENT_SECRET'] || userCredentials?.['GOOGLE_CLIENT_SECRET']
      });

      if (result.success && result.tokens) {
        // Store tokens for this integration
        const tokenEnvVars: Record<string, string> = {
          GOOGLE_ACCESS_TOKEN: result.tokens.accessToken,
          GOOGLE_REFRESH_TOKEN: result.tokens.refreshToken,
          GOOGLE_TOKEN_EXPIRES_AT: result.tokens.expiresAt.toString()
        };

        // Merge with existing env vars
        const existingVars = manager.getEnvVars(integrationId) || {};
        manager.setEnvVars(integrationId, { ...existingVars, ...tokenEnvVars });

        // If this is Gmail, write credential files AND set env vars for the MCP server
        if (integrationId === 'gmail') {
          const gmailTokens: GmailOAuthTokens = {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresAt: result.tokens.expiresAt
          };
          // Write BOTH credential files and get the paths as env vars
          const { getGmailEnvVars } = await import('./gmailCredentialManager.js');
          const credentialEnvVars = getGmailEnvVars('gmail', gmailTokens);

          // Merge credential paths with existing env vars
          const currentVars = manager.getEnvVars(integrationId) || {};
          manager.setEnvVars(integrationId, { ...currentVars, ...credentialEnvVars });
          console.log('[OAuth] Wrote Gmail credential files and set env vars:', credentialEnvVars);

          // Auto-start the Gmail MCP server now that credentials exist
          try {
            await manager.startServer(integrationId);
            console.log('[OAuth] Started Gmail MCP server');
          } catch (startError) {
            console.error('[OAuth] Failed to auto-start Gmail MCP server:', startError);
            // Don't fail the OAuth - just log the error
          }
        }

        // If this is Calendar, write credential files AND set env vars for the MCP server
        if (integrationId === 'calendar') {
          const calendarTokens: CalendarOAuthTokens = {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresAt: result.tokens.expiresAt
          };
          // Write credential files and get the env vars
          const credentialEnvVars = getCalendarEnvVars(calendarTokens);

          // Merge credential paths with existing env vars
          const currentVars = manager.getEnvVars(integrationId) || {};
          manager.setEnvVars(integrationId, { ...currentVars, ...credentialEnvVars });
          console.log('[OAuth] Wrote Calendar credential files and set env vars:', credentialEnvVars);

          // Auto-start the Calendar MCP server now that credentials exist
          try {
            await manager.startServer(integrationId);
            console.log('[OAuth] Started Calendar MCP server');
          } catch (startError) {
            console.error('[OAuth] Failed to auto-start Calendar MCP server:', startError);
            // Don't fail the OAuth - just log the error
          }
        }

        console.log(`[OAuth] Successfully authenticated ${integrationId}`);
        return { success: true, tokens: result.tokens };
      }

      return result;
    } catch (error) {
      console.error('[OAuth] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during OAuth'
      };
    }
  });

  // Check if OAuth tokens exist for an integration
  ipcMain.handle('mcp:hasOAuthTokens', (_event, integrationId: string) => {
    const envVars = manager.getEnvVars(integrationId);
    return !!(envVars?.GOOGLE_ACCESS_TOKEN && envVars?.GOOGLE_REFRESH_TOKEN);
  });

  // Clear OAuth tokens for an integration
  ipcMain.handle('mcp:clearOAuthTokens', (_event, integrationId: string) => {
    try {
      const envVars = manager.getEnvVars(integrationId) || {};
      delete envVars.GOOGLE_ACCESS_TOKEN;
      delete envVars.GOOGLE_REFRESH_TOKEN;
      delete envVars.GOOGLE_TOKEN_EXPIRES_AT;
      manager.setEnvVars(integrationId, envVars);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // ============================================
  // Gmail Account Management Handlers
  // ============================================

  // Add Gmail account
  ipcMain.handle('mcp:addGmailAccount', async (_event, label: string) => {
    try {
      // Check for empty label
      if (!label?.trim()) {
        return { success: false, error: 'Label cannot be empty' };
      }

      // Generate account ID
      const accountId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const integrationId = `gmail-${accountId}`;

      // Start OAuth flow
      const oauthResult = await startGoogleOAuthWithAutoConfig(
        'gmail',
        mainWindow,
        { clientId: GOOGLE_OAUTH_CREDENTIALS.clientId, clientSecret: GOOGLE_OAUTH_CREDENTIALS.clientSecret }
      );

      if (!oauthResult.success || !oauthResult.tokens) {
        return { success: false, error: oauthResult.error || 'OAuth failed' };
      }

      // Fetch email address using access token
      const email = await fetchGmailEmailAddress(oauthResult.tokens.accessToken);

      // Create virtual integration
      const integration = createGmailAccountIntegration(accountId, label, email);

      // Register integration as custom
      registerCustomIntegration(integration);

      // Write credential files for this account AND set env vars
      // CRITICAL FIX: Each Gmail account needs its own credential files
      const gmailTokens: GmailOAuthTokens = {
        accessToken: oauthResult.tokens.accessToken,
        refreshToken: oauthResult.tokens.refreshToken,
        expiresAt: oauthResult.tokens.expiresAt
      };

      // Write credential files and get env vars pointing to them
      const { getGmailEnvVars } = await import('./gmailCredentialManager.js');
      const credentialEnvVars = getGmailEnvVars(accountId, gmailTokens);

      // Merge credential paths with token data
      manager.setEnvVars(integrationId, {
        ...credentialEnvVars, // GMAIL_OAUTH_PATH and GMAIL_CREDENTIALS_PATH
        GOOGLE_ACCESS_TOKEN: oauthResult.tokens.accessToken,
        GOOGLE_REFRESH_TOKEN: oauthResult.tokens.refreshToken,
        GOOGLE_TOKEN_EXPIRES_AT: oauthResult.tokens.expiresAt.toString()
      });

      console.log(`[Gmail] Wrote credential files for ${integrationId}:`, credentialEnvVars);

      // Return account object
      const account = {
        id: accountId,
        label,
        email,
        enabled: true,
        tokens: oauthResult.tokens,
        createdAt: new Date().toISOString(),
        integrationId
      };

      console.log(`[Gmail] Added account: ${label} (${email})`);
      return { success: true, account };
    } catch (error) {
      console.error('[Gmail] Failed to add account:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Initialize Gmail account credentials (write credential files on app startup)
  ipcMain.handle('mcp:initializeGmailAccountCredentials', async (_event, accountId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => {
    try {
      const gmailTokens: GmailOAuthTokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      };

      // Write credential files and get env vars
      const { getGmailEnvVars } = await import('./gmailCredentialManager.js');
      const credentialEnvVars = getGmailEnvVars(accountId, gmailTokens);

      console.log(`[Gmail] Initialized credential files for ${accountId}:`, credentialEnvVars);
      return { success: true, envVars: credentialEnvVars };
    } catch (error) {
      console.error('[Gmail] Failed to initialize credentials:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Remove Gmail account
  ipcMain.handle('mcp:removeGmailAccount', async (_event, accountId: string, integrationId: string) => {
    try {
      // Stop MCP server if running
      const status = manager.getStatus()[integrationId];
      if (status?.status === 'ready' || status?.status === 'starting') {
        await manager.stopServer(integrationId);
      }

      // Remove virtual integration
      unregisterCustomIntegration(integrationId);

      // Clear tokens
      manager.setEnvVars(integrationId, {});

      console.log(`[Gmail] Removed account: ${integrationId}`);
      return { success: true };
    } catch (error) {
      console.error('[Gmail] Failed to remove account:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Re-register virtual Gmail account integration (for app startup)
  ipcMain.handle('mcp:registerVirtualGmailAccount', async (_event, accountId: string, label: string, email: string) => {
    try {
      // Create virtual integration
      const integration = createGmailAccountIntegration(accountId, label, email);

      // Register integration as custom
      registerCustomIntegration(integration);

      console.log(`[Gmail] Re-registered virtual integration: ${integration.id} (${label})`);
      return { success: true };
    } catch (error) {
      console.error('[Gmail] Failed to register virtual integration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[MCP] IPC handlers registered');
}

/**
 * Cleanup MCP handlers on app quit
 */
export async function cleanupMCPHandlers(): Promise<void> {
  const manager = getMCPManager();
  await manager.stopAll();
  console.log('[MCP] All servers stopped');
}
