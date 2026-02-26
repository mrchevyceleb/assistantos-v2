import { get } from 'svelte/store';
import { workspacePath } from '$lib/stores/workspace';
import {
  readFileText, writeFileText, createFile, deletePath, renamePath,
  searchFiles, getFileInfo, readDirectoryTree, listAllFiles, runCommandSync,
} from '$lib/utils/tauri';
import type { ToolCall, ToolResult } from '../types';
import { MAX_READ_FILE_CHARS, MAX_SEARCH_RESULTS, MAX_LIST_FILES } from '../constants';

function resolvePath(relativePath: string): string {
  const wsPath = get(workspacePath);
  if (!wsPath) throw new Error('No workspace open');

  // If already absolute, return as-is
  if (relativePath.match(/^[A-Z]:/i) || relativePath.startsWith('/')) {
    return relativePath;
  }

  // Resolve relative to workspace root
  // Normalize path separators
  const base = wsPath.replace(/\\/g, '/');
  const rel = relativePath.replace(/\\/g, '/');
  return `${base}/${rel}`.replace(/\/+/g, '/');
}

export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const { name, arguments: argsJson } = toolCall.function;
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(argsJson);
  } catch {
    return {
      toolCallId: toolCall.id,
      toolName: name,
      content: `Failed to parse tool arguments: ${argsJson}`,
      isError: true,
    };
  }

  try {
    let result: string;

    switch (name) {
      case 'list_files': {
        const path = resolvePath((args.path as string) || '');
        const files = await listAllFiles(path);
        const limited = files.slice(0, MAX_LIST_FILES);
        result = limited.map(f => f.relative_path).join('\n');
        if (files.length > MAX_LIST_FILES) {
          result += `\n... (${files.length - MAX_LIST_FILES} more files truncated)`;
        }
        break;
      }

      case 'read_file': {
        const path = resolvePath(args.path as string);
        let content = await readFileText(path);
        if (content.length > MAX_READ_FILE_CHARS) {
          content = content.substring(0, MAX_READ_FILE_CHARS) + '\n... (truncated)';
        }
        result = content;
        break;
      }

      case 'search_files': {
        const searchPath = resolvePath((args.path as string) || '');
        const results = await searchFiles(
          searchPath,
          args.query as string,
          (args.case_sensitive as boolean) || false,
        );
        const limited = results.slice(0, MAX_SEARCH_RESULTS);
        result = limited.map(r => `${r.path}:${r.line_number}: ${r.line_content}`).join('\n');
        if (results.length > MAX_SEARCH_RESULTS) {
          result += `\n... (${results.length - MAX_SEARCH_RESULTS} more results truncated)`;
        }
        break;
      }

      case 'get_file_info': {
        const path = resolvePath(args.path as string);
        const info = await getFileInfo(path);
        result = JSON.stringify(info, null, 2);
        break;
      }

      case 'directory_tree': {
        const path = resolvePath((args.path as string) || '');
        const tree = await readDirectoryTree(path);
        result = JSON.stringify(tree, null, 2);
        break;
      }

      case 'create_file': {
        const path = resolvePath(args.path as string);
        const isDir = (args.is_directory as boolean) || false;
        try {
          await createFile(path, isDir);
        } catch (e) {
          // If creating a file fails (e.g. already exists) but content is provided,
          // fall through to write the content anyway
          if (isDir || !args.content) throw e;
        }
        if (!isDir && args.content) {
          await writeFileText(path, args.content as string);
        }
        result = `Created ${isDir ? 'directory' : 'file'}: ${args.path}`;
        break;
      }

      case 'write_file': {
        const path = resolvePath(args.path as string);
        await writeFileText(path, args.content as string);
        result = `Wrote ${(args.content as string).length} characters to ${args.path}`;
        break;
      }

      case 'delete_path': {
        const path = resolvePath(args.path as string);
        await deletePath(path);
        result = `Deleted: ${args.path}`;
        break;
      }

      case 'rename_path': {
        const oldPath = resolvePath(args.old_path as string);
        const newPath = resolvePath(args.new_path as string);
        await renamePath(oldPath, newPath);
        result = `Renamed ${args.old_path} -> ${args.new_path}`;
        break;
      }

      case 'run_command': {
        const cwd = args.cwd ? resolvePath(args.cwd as string) : (get(workspacePath) || '');
        const cmdResult = await runCommandSync(
          args.command as string,
          cwd,
          args.timeout_ms as number | undefined,
        );
        result = '';
        if (cmdResult.stdout) result += cmdResult.stdout;
        if (cmdResult.stderr) result += (result ? '\n' : '') + `STDERR: ${cmdResult.stderr}`;
        result += `\nExit code: ${cmdResult.exit_code}`;
        break;
      }

      default:
        return {
          toolCallId: toolCall.id,
          toolName: name,
          content: `Unknown tool: ${name}`,
          isError: true,
        };
    }

    return {
      toolCallId: toolCall.id,
      toolName: name,
      content: result,
    };
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      toolName: name,
      content: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}
