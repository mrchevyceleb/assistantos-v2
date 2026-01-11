import { executeFileTool } from './fileTools';
import { executeBashTool } from './bashTool';
import { executeCreateIntegration } from './integrationTool';
import { allTools } from './schemas';

export { allTools } from './schemas';

const FILE_TOOLS = ['read_file', 'write_file', 'list_directory', 'file_exists', 'create_directory'];

// Local tools that are always available
const LOCAL_TOOLS = new Set([...FILE_TOOLS, 'bash', 'create_mcp_integration']);

/**
 * Execute a tool - routes to local handler or MCP server
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspacePath: string
): Promise<string> {
  // Handle local file tools
  if (FILE_TOOLS.includes(name)) {
    return executeFileTool(name, input, workspacePath);
  }

  // Handle bash
  if (name === 'bash') {
    return executeBashTool(input, workspacePath);
  }

  // Handle create_mcp_integration
  if (name === 'create_mcp_integration') {
    return executeCreateIntegration(input);
  }

  // Try MCP tools - they use prefixed names (e.g., mcp__gmail__search)
  if (name.startsWith('mcp__') || name.includes('__')) {
    try {
      const integrationId = await window.electronAPI.mcp.findIntegrationForTool(name);
      if (integrationId) {
        const result = await window.electronAPI.mcp.executeTool(integrationId, name, input);
        if (result.success) {
          return typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result, null, 2);
        } else {
          throw new Error(result.error || 'MCP tool execution failed');
        }
      }
    } catch (error) {
      console.error('MCP tool execution error:', error);
      throw error;
    }
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Create a tool executor bound to a workspace
 */
export function createToolExecutor(workspacePath: string) {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    return executeTool(name, input, workspacePath);
  };
}

/**
 * Check if a tool is a local (non-MCP) tool
 */
export function isLocalTool(name: string): boolean {
  return LOCAL_TOOLS.has(name);
}

export { allTools as tools };
