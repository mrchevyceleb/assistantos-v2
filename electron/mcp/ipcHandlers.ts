/**
 * MCP IPC Handlers
 * Bridge between renderer process and MCP Manager
 */

import { ipcMain } from 'electron';
import { getMCPManager } from './MCPManager.js';
import { getMentionMap, getAllMentions, MCP_INTEGRATIONS } from './registry.js';

/**
 * Register all MCP-related IPC handlers
 */
export function registerMCPHandlers(): void {
  const manager = getMCPManager();

  // Get all integrations from registry
  ipcMain.handle('mcp:getIntegrations', () => {
    return MCP_INTEGRATIONS;
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
