import { executeFileTool } from './fileTools';
import { executeBashTool } from './bashTool';
import { allTools } from './schemas';

export { allTools } from './schemas';

const FILE_TOOLS = ['read_file', 'write_file', 'list_directory', 'file_exists', 'create_directory'];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspacePath: string
): Promise<string> {
  if (FILE_TOOLS.includes(name)) {
    return executeFileTool(name, input, workspacePath);
  }

  if (name === 'bash') {
    return executeBashTool(input, workspacePath);
  }

  throw new Error(`Unknown tool: ${name}`);
}

export function createToolExecutor(workspacePath: string) {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    return executeTool(name, input, workspacePath);
  };
}

export { allTools as tools };
