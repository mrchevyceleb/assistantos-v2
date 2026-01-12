/**
 * MCP Manager
 * Manages spawning, lifecycle, and communication with MCP servers
 */

import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPIntegration, getAllIntegrations, getIntegration } from './registry.js';
import type { BrowserWindow } from 'electron';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface MCPServerInstance {
  integration: MCPIntegration;
  process: ChildProcess;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPTool[];
  status: 'starting' | 'ready' | 'error' | 'stopped';
  error?: string;
}

export interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class MCPManager {
  private servers: Map<string, MCPServerInstance> = new Map();
  private envVars: Map<string, Record<string, string>> = new Map();
  private mainWindow?: BrowserWindow;

  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Configure environment variables for an integration
   */
  setEnvVars(integrationId: string, vars: Record<string, string>): void {
    this.envVars.set(integrationId, vars);
  }

  /**
   * Get configured environment variables for an integration
   */
  getEnvVars(integrationId: string): Record<string, string> | undefined {
    return this.envVars.get(integrationId);
  }

  /**
   * Start an MCP server for the given integration
   */
  async startServer(integrationId: string): Promise<void> {
    const integration = getIntegration(integrationId);
    if (!integration) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }

    // Check if already running
    if (this.servers.has(integrationId)) {
      const existing = this.servers.get(integrationId)!;
      if (existing.status === 'ready') return;
      // Stop if in error state and restart
      await this.stopServer(integrationId);
    }

    // Get configured env vars and apply defaults
    const configuredVars = this.envVars.get(integrationId) || {};
    const envVars: Record<string, string> = {};

    // Apply defaults first, then override with configured values
    for (const envDef of integration.requiredEnvVars) {
      if (envDef.defaultValue) {
        envVars[envDef.key] = envDef.defaultValue;
      }
    }
    Object.assign(envVars, configuredVars);

    // Validate required env vars (skip OAuth ones and those with defaults)
    for (const required of integration.requiredEnvVars) {
      if (required.type !== 'oauth' && !envVars[required.key]) {
        throw new Error(`Missing required configuration: ${required.label}`);
      }
    }

    // Build environment with system vars + configured vars
    const envWithVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        envWithVars[key] = value;
      }
    }
    Object.assign(envWithVars, envVars);

    // Spawn the process
    const serverProcess = spawn(integration.command, integration.args, {
      env: envWithVars,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    // Create transport and client
    const transport = new StdioClientTransport({
      command: integration.command,
      args: integration.args,
      env: envWithVars
    });

    const client = new Client({
      name: 'assistantos',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    const instance: MCPServerInstance = {
      integration,
      process: serverProcess,
      client,
      transport,
      tools: [],
      status: 'starting'
    };

    this.servers.set(integrationId, instance);

    try {
      // Connect to the server
      await client.connect(transport);

      // List available tools
      const toolsResult = await client.listTools();
      instance.tools = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
      }));

      instance.status = 'ready';
      console.log(`[MCPManager] Started ${integrationId} with ${instance.tools.length} tools`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MCPManager] Failed to start ${integrationId}:`, error);
      throw error;
    }

    // Handle process exit
    serverProcess.on('exit', (code) => {
      if (instance.status !== 'stopped') {
        instance.status = 'error';
        instance.error = `Process exited with code ${code}`;
        console.log(`[MCPManager] ${integrationId} exited with code ${code}`);

        // Notify renderer of crash
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('mcp:server-crashed', {
            integrationId,
            exitCode: code,
            error: instance.error
          });
        }
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(`[MCPManager] ${integrationId} stderr:`, data.toString());
    });
  }

  /**
   * Stop an MCP server
   */
  async stopServer(integrationId: string): Promise<void> {
    const instance = this.servers.get(integrationId);
    if (!instance) return;

    instance.status = 'stopped';

    try {
      await instance.client.close();
    } catch {
      // Ignore close errors
    }

    if (instance.process && !instance.process.killed) {
      instance.process.kill();
    }

    this.servers.delete(integrationId);
    console.log(`[MCPManager] Stopped ${integrationId}`);
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.servers.keys());
    await Promise.all(ids.map(id => this.stopServer(id)));
  }

  /**
   * Check if a server is running and ready
   */
  isServerReady(integrationId: string): boolean {
    const instance = this.servers.get(integrationId);
    return instance?.status === 'ready';
  }

  /**
   * Get tools for active integrations, with prefixing
   */
  getToolsForIntegrations(integrationIds: string[]): Array<{
    name: string;
    description: string;
    input_schema: object;
    integrationId: string;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      input_schema: object;
      integrationId: string;
    }> = [];

    for (const id of integrationIds) {
      const instance = this.servers.get(id);
      if (instance?.status === 'ready') {
        for (const tool of instance.tools) {
          tools.push({
            name: `${instance.integration.toolPrefix}${tool.name}`,
            description: `[${instance.integration.name}] ${tool.description}`,
            input_schema: tool.inputSchema,
            integrationId: id
          });
        }
      }
    }

    return tools;
  }

  /**
   * Execute a tool on an MCP server with automatic reconnection
   */
  async executeTool(
    integrationId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const instance = this.servers.get(integrationId);

      if (!instance) {
        return {
          success: false,
          error: `Integration ${integrationId} is not running`
        };
      }

      // Auto-restart if not ready and first attempt
      if (instance.status !== 'ready' && attempt === 0) {
        console.log(`[MCPManager] Auto-reconnecting ${integrationId}...`);
        try {
          await this.startServer(integrationId);
        } catch (err) {
          lastError = err as Error;
          await this.delay(100 * Math.pow(2, attempt));
          continue;
        }
      }

      if (instance.status !== 'ready') {
        return {
          success: false,
          error: `Integration ${integrationId} is not ready (status: ${instance.status})`
        };
      }

      // Remove prefix to get original tool name
      const originalName = toolName.replace(instance.integration.toolPrefix, '');

      try {
        const result = await instance.client.callTool({
          name: originalName,
          arguments: input
        });

        return {
          success: true,
          result: result.content
        };
      } catch (error) {
        lastError = error as Error;

        // Check if it's a connection error (-32000 or connection closed message)
        const errorMessage = error instanceof Error ? error.message : '';
        const isConnectionError =
          (error as any).code === -32000 ||
          errorMessage.toLowerCase().includes('connection closed') ||
          errorMessage.toLowerCase().includes('connection lost');

        if (isConnectionError && attempt < MAX_RETRIES - 1) {
          const delay = 100 * Math.pow(2, attempt);
          console.log(`[MCPManager] Connection error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          instance.status = 'error'; // Mark for reconnection
          await this.delay(delay);
          continue;
        }

        // Non-connection error or final retry exhausted
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return {
      success: false,
      error: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`
    };
  }

  /**
   * Helper method for exponential backoff delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get status of all integrations
   */
  getStatus(): Record<string, { status: string; error?: string; toolCount?: number }> {
    const status: Record<string, { status: string; error?: string; toolCount?: number }> = {};

    for (const [id, instance] of this.servers) {
      status[id] = {
        status: instance.status,
        error: instance.error,
        toolCount: instance.tools.length
      };
    }

    return status;
  }

  /**
   * Get all available integrations from registry
   */
  getIntegrations(): MCPIntegration[] {
    return getAllIntegrations();
  }

  /**
   * Pre-start all enabled integrations in the background
   * Used at app startup for Claude Code-like instant tool availability
   * @param configs - Integration configurations with enabled flags and envVars
   */
  async preStartEnabled(
    configs: Record<string, { enabled: boolean; envVars: Record<string, string> }>
  ): Promise<void> {
    // Get enabled integration IDs that have required config
    const enabledIds: string[] = [];
    for (const [id, config] of Object.entries(configs)) {
      if (!config.enabled) continue;

      const integration = getIntegration(id);
      if (!integration) continue;

      // Check if all required non-OAuth env vars are configured
      const hasRequiredConfig = integration.requiredEnvVars.every(
        req => req.type === 'oauth' || config.envVars[req.key]
      );

      if (hasRequiredConfig) {
        // Set env vars first
        this.setEnvVars(id, config.envVars);
        enabledIds.push(id);
      }
    }

    if (enabledIds.length === 0) {
      console.log('[MCPManager] No enabled integrations to pre-start');
      return;
    }

    console.log(`[MCPManager] Pre-starting ${enabledIds.length} integrations:`, enabledIds);

    // Start all in parallel, don't fail if individual servers fail
    const results = await Promise.allSettled(
      enabledIds.map(id => this.startServer(id))
    );

    // Log results
    for (let i = 0; i < enabledIds.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        console.warn(`[MCPManager] Failed to pre-start ${enabledIds[i]}:`, result.reason);
      }
    }
  }

  /**
   * Find which integration a prefixed tool belongs to
   */
  findIntegrationForTool(prefixedToolName: string): string | undefined {
    for (const int of getAllIntegrations()) {
      if (prefixedToolName.startsWith(int.toolPrefix)) {
        return int.id;
      }
    }
    return undefined;
  }
}

// Singleton instance
let mcpManagerInstance: MCPManager | null = null;

export function getMCPManager(mainWindow?: BrowserWindow): MCPManager {
  if (!mcpManagerInstance) {
    mcpManagerInstance = new MCPManager(mainWindow);
  }
  return mcpManagerInstance;
}

export function destroyMCPManager(): void {
  if (mcpManagerInstance) {
    mcpManagerInstance.stopAll();
    mcpManagerInstance = null;
  }
}
