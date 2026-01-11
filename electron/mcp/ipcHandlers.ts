/**
 * MCP IPC Handlers
 * Bridge between renderer process and MCP Manager
 */

import { ipcMain } from 'electron';
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
  MCPIntegration
} from './registry.js';

/**
 * Register all MCP-related IPC handlers
 */
export function registerMCPHandlers(): void {
  const manager = getMCPManager();

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
    return manager.executeTool(integrationId, toolName, input);
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
