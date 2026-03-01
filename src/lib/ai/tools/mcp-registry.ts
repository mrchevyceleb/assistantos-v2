import { get } from 'svelte/store';
import { settings, type MCPServerConfig } from '$lib/stores/settings';
import { mcpListTools } from '$lib/utils/tauri';
import type { ToolDefinition } from '../types';
import { setDynamicToolDefinitions } from './tool-definitions';

interface McpToolMetadata {
  server: MCPServerConfig;
  originalName: string;
}

const mcpToolMap = new Map<string, McpToolMetadata>();

function normalizeToolName(serverId: string, toolName: string): string {
  const safeServer = serverId.replace(/[^a-zA-Z0-9_]/g, '_');
  const safeTool = toolName.replace(/[^a-zA-Z0-9_]/g, '_');
  return `mcp__${safeServer}__${safeTool}`;
}

function parseTools(payload: string): Array<{ name: string; description?: string; inputSchema?: unknown; input_schema?: unknown }> {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.tools)) return parsed.tools;
  } catch {
    return [];
  }
  return [];
}

export function getMcpToolMetadata(normalizedName: string): McpToolMetadata | undefined {
  return mcpToolMap.get(normalizedName);
}

export async function refreshMcpToolDefinitions(): Promise<ToolDefinition[]> {
  const conf = get(settings);
  const enabledServers = conf.mcpServers.filter((s) => s.enabled && s.url.trim());

  const dynamicDefinitions: ToolDefinition[] = [];
  mcpToolMap.clear();

  for (const server of enabledServers) {
    try {
      const raw = await mcpListTools(
        server.url.trim(),
        server.authToken || undefined,
        server.headersJson || undefined,
        server.timeoutMs,
      );
      const tools = parseTools(raw);
      for (const tool of tools) {
        if (!tool?.name) continue;
        const normalized = normalizeToolName(server.id, tool.name);
        const schema = (tool.inputSchema || tool.input_schema || {
          type: 'object',
          properties: {},
        }) as { type: 'object'; properties: Record<string, unknown>; required?: string[] };

        dynamicDefinitions.push({
          type: 'function',
          function: {
            name: normalized,
            description: `[MCP:${server.name}] ${tool.description || tool.name}`,
            parameters: schema,
          },
        });

        mcpToolMap.set(normalized, {
          server,
          originalName: tool.name,
        });
      }
    } catch {
      // Keep going so one broken server does not remove all tools.
    }
  }

  setDynamicToolDefinitions(dynamicDefinitions);
  return dynamicDefinitions;
}
