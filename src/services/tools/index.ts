import { executeFileTool } from './fileTools';
import { executeBashTool } from './bashTool';
import { executeCreateIntegration } from './integrationTool';
import { executeEfficientTool } from './efficientTools';
import { allTools } from './schemas';

export { allTools } from './schemas';

const FILE_TOOLS = ['read_file', 'write_file', 'list_directory', 'file_exists', 'create_directory'];
const EFFICIENT_TOOLS = ['grep', 'glob', 'edit'];

// Local tools that are always available
const LOCAL_TOOLS = new Set([...FILE_TOOLS, ...EFFICIENT_TOOLS, 'bash', 'create_mcp_integration']);

/**
 * Execute a tool - routes to local handler or MCP server
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspacePath: string,
  agentId?: string,
  agentName?: string
): Promise<string> {
  // Handle local file tools
  if (FILE_TOOLS.includes(name)) {
    return executeFileTool(name, input, workspacePath, agentId, agentName);
  }

  // Handle efficient tools (grep, glob, edit)
  if (EFFICIENT_TOOLS.includes(name)) {
    return executeEfficientTool(name, input, workspacePath, agentId, agentName);
  }

  // Handle bash
  if (name === 'bash') {
    return executeBashTool(input, workspacePath);
  }

  // Handle create_mcp_integration
  if (name === 'create_mcp_integration') {
    return executeCreateIntegration(input);
  }

  // Try MCP tools - check if there's an integration that handles this tool
  // Tools use prefixed names like gmail_search_emails, calendar_list_events, etc.
  try {
    const integrationId = await window.electronAPI.mcp.findIntegrationForTool(name);

    if (integrationId) {
      const result = await window.electronAPI.mcp.executeTool(integrationId, name, input);

      if (result.success) {
        const formattedResult = typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result, null, 2);
        return formattedResult;
      } else {
        throw new Error(result.error || 'MCP tool execution failed');
      }
    }
  } catch (error) {
    console.error('[Tool] MCP execution error:', error);
    throw error;
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Create a tool executor bound to a workspace and optionally an agent
 */
export function createToolExecutor(workspacePath: string, agentId?: string, agentName?: string) {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    return executeTool(name, input, workspacePath, agentId, agentName);
  };
}

/**
 * Check if a tool is a local (non-MCP) tool
 */
export function isLocalTool(name: string): boolean {
  return LOCAL_TOOLS.has(name);
}

export { allTools as tools };
