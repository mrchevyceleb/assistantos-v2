import * as pathUtils from 'path-browserify';
import { useFileLockStore } from '../../stores/fileLockStore';

function resolvePath(inputPath: string, workspacePath: string): string {
  // If it's an absolute path, use it directly
  if (pathUtils.isAbsolute(inputPath)) {
    return inputPath;
  }
  // Otherwise, resolve relative to workspace
  return pathUtils.join(workspacePath, inputPath);
}

export async function executeFileTool(
  name: string,
  input: Record<string, unknown>,
  workspacePath: string,
  agentId?: string,
  agentName?: string
): Promise<string> {
  const api = window.electronAPI.fs;

  switch (name) {
    case 'read_file': {
      const filePath = resolvePath(input.path as string, workspacePath);

      // Acquire read lock if agent info provided
      let operationId: string | undefined;
      if (agentId && agentName) {
        operationId = await useFileLockStore.getState().requestOperation(
          agentId,
          agentName,
          filePath,
          'read'
        );
      }

      try {
        const content = await api.readFile(filePath);
        if (content === null) {
          throw new Error(`File not found or could not be read: ${filePath}`);
        }
        return content;
      } finally {
        // Release lock
        if (operationId) {
          useFileLockStore.getState().releaseOperation(operationId);
        }
      }
    }

    case 'write_file': {
      const filePath = resolvePath(input.path as string, workspacePath);
      const content = input.content as string;

      // Acquire write lock if agent info provided
      let operationId: string | undefined;
      if (agentId && agentName) {
        operationId = await useFileLockStore.getState().requestOperation(
          agentId,
          agentName,
          filePath,
          'write'
        );
      }

      try {
        const success = await api.writeFile(filePath, content);
        if (!success) {
          throw new Error(`Failed to write file: ${filePath}`);
        }

        // Release lock on success
        if (operationId) {
          useFileLockStore.getState().releaseOperation(operationId);
        }

        return `Successfully wrote ${content.length} characters to ${filePath}`;
      } catch (error) {
        // Release lock with error
        if (operationId) {
          useFileLockStore.getState().releaseOperation(
            operationId,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        throw error;
      }
    }

    case 'list_directory': {
      const dirPath = resolvePath(input.path as string, workspacePath);
      const entries = await api.readDir(dirPath);
      if (entries.length === 0) {
        const exists = await api.exists(dirPath);
        if (!exists) {
          throw new Error(`Directory not found: ${dirPath}`);
        }
        return 'Directory is empty';
      }
      const formatted = entries.map(entry =>
        `${entry.isDirectory ? '[DIR]' : '[FILE]'} ${entry.name}`
      ).join('\n');
      return formatted;
    }

    case 'file_exists': {
      const filePath = resolvePath(input.path as string, workspacePath);
      const exists = await api.exists(filePath);
      return exists ? `Path exists: ${filePath}` : `Path does not exist: ${filePath}`;
    }

    case 'create_directory': {
      const dirPath = resolvePath(input.path as string, workspacePath);
      const success = await api.createDir(dirPath);
      if (!success) {
        throw new Error(`Failed to create directory: ${dirPath}`);
      }
      return `Successfully created directory: ${dirPath}`;
    }

    default:
      throw new Error(`Unknown file tool: ${name}`);
  }
}
