/**
 * Efficient Tools
 *
 * Tools optimized for minimal context usage:
 * - grep: Search without reading entire files
 * - glob: Find files without listing everything
 * - edit: Modify without full read/write cycle
 */

import * as pathUtils from 'path-browserify';
import { useFileLockStore } from '../../stores/fileLockStore';

function resolvePath(inputPath: string, workspacePath: string): string {
  if (!inputPath) return workspacePath;
  if (pathUtils.isAbsolute(inputPath)) {
    return inputPath;
  }
  return pathUtils.join(workspacePath, inputPath);
}

interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

interface GlobInput {
  pattern: string;
  cwd?: string;
  ignore?: string[];
  maxResults?: number;
}

interface EditInput {
  path: string;
  old_text: string;
  new_text: string;
}

/**
 * Execute grep tool - search for pattern in files
 * Uses the native fs:grep IPC handler for regex-based content search
 */
async function executeGrep(input: GrepInput, workspacePath: string): Promise<string> {
  const searchPath = resolvePath(input.path || '', workspacePath);
  const maxResults = input.maxResults || 50;

  try {
    // Use the native grep IPC handler
    const results = await window.electronAPI.fs.grep(input.pattern, searchPath, {
      include: input.include,
      exclude: input.exclude,
      caseSensitive: input.caseSensitive,
      maxResults
    });

    if (!results || results.length === 0) {
      return `No matches found for pattern: ${input.pattern}`;
    }

    // Format results
    const formatted = results.map((match) => {
      return `${match.relativePath}:${match.lineNumber}: ${match.lineContent.trim()}`;
    }).join('\n');

    const truncated = results.length >= maxResults
      ? `\n\n[... more results may exist, increase maxResults to see them]`
      : '';

    return `Found ${results.length} match${results.length === 1 ? '' : 'es'}:\n\n${formatted}${truncated}`;
  } catch (error) {
    // Fallback to bash grep if native grep fails
    console.log('[grep] Falling back to bash grep');
    const cmd = buildGrepCommand(input, searchPath);
    const bashResult = await window.electronAPI.bash.execute(cmd, workspacePath);

    if (bashResult.exitCode !== 0 && !bashResult.stdout) {
      return `No matches found for pattern: ${input.pattern}`;
    }

    const lines = bashResult.stdout.split('\n').filter(Boolean).slice(0, maxResults);
    return lines.length > 0
      ? `Found matches:\n\n${lines.join('\n')}`
      : `No matches found for pattern: ${input.pattern}`;
  }
}

/**
 * Build grep command for fallback
 */
function buildGrepCommand(input: GrepInput, searchPath: string): string {
  const isWindows = navigator.platform.toLowerCase().includes('win');

  if (isWindows) {
    // PowerShell command
    const pattern = input.pattern.replace(/"/g, '`"');
    const includeFilter = input.include
      ? `-Include "${input.include}"`
      : '-Include "*.ts","*.tsx","*.js","*.jsx","*.md","*.json"';
    const caseFlag = input.caseSensitive ? '' : '-i';

    return `Get-ChildItem -Path "${searchPath}" -Recurse ${includeFilter} -Exclude "node_modules","dist",".git" | Select-String -Pattern "${pattern}" ${caseFlag} | Select-Object -First ${input.maxResults || 50} | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }`;
  } else {
    // Unix grep command
    const caseFlag = input.caseSensitive ? '' : '-i';
    const includeFlag = input.include ? `--include="${input.include}"` : '--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.md"';

    return `grep -rn ${caseFlag} ${includeFlag} --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git "${input.pattern}" "${searchPath}" | head -${input.maxResults || 50}`;
  }
}

/**
 * Execute glob tool - find files by pattern
 */
async function executeGlob(input: GlobInput, workspacePath: string): Promise<string> {
  const searchPath = resolvePath(input.cwd || '', workspacePath);
  const maxResults = input.maxResults || 100;
  const defaultIgnore = ['node_modules/**', 'dist/**', '.git/**', 'coverage/**', 'build/**'];
  const ignore = input.ignore || defaultIgnore;

  try {
    const result = await window.electronAPI.fs.glob(
      input.pattern,
      searchPath,
      { ignore, maxResults }
    );

    if (!result || result.length === 0) {
      return `No files found matching pattern: ${input.pattern}`;
    }

    // Format as relative paths
    const formatted = result.slice(0, maxResults).map((filePath: string) => {
      return filePath.replace(workspacePath, '').replace(/^[/\\]/, '');
    }).join('\n');

    const truncated = result.length > maxResults
      ? `\n\n[... ${result.length - maxResults} more files truncated]`
      : '';

    return `Found ${result.length} file${result.length === 1 ? '' : 's'}:\n\n${formatted}${truncated}`;
  } catch (error) {
    // Fallback to bash find
    console.log('[glob] Falling back to bash find');
    const cmd = buildGlobCommand(input, searchPath);
    const bashResult = await window.electronAPI.bash.execute(cmd, workspacePath);

    if (bashResult.exitCode !== 0 && !bashResult.stdout) {
      return `No files found matching pattern: ${input.pattern}`;
    }

    const files = bashResult.stdout.split('\n').filter(Boolean).slice(0, maxResults);
    return files.length > 0
      ? `Found ${files.length} file${files.length === 1 ? '' : 's'}:\n\n${files.join('\n')}`
      : `No files found matching pattern: ${input.pattern}`;
  }
}

/**
 * Build glob/find command for fallback
 */
function buildGlobCommand(input: GlobInput, searchPath: string): string {
  const isWindows = navigator.platform.toLowerCase().includes('win');
  const pattern = input.pattern;

  if (isWindows) {
    // PowerShell Get-ChildItem
    const filterPattern = pattern.replace(/\*\*/g, '*').replace(/\*/g, '*');
    return `Get-ChildItem -Path "${searchPath}" -Recurse -Name -Filter "${filterPattern}" | Where-Object { $_ -notmatch 'node_modules|dist|\\.git' } | Select-Object -First ${input.maxResults || 100}`;
  } else {
    // Unix find
    const namePattern = pattern.includes('/')
      ? pattern.split('/').pop() || '*'
      : pattern;
    return `find "${searchPath}" -name "${namePattern}" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | head -${input.maxResults || 100}`;
  }
}

/**
 * Execute edit tool - replace text in file
 * Uses the native fs:edit IPC handler for atomic text replacement
 */
async function executeEdit(
  input: EditInput,
  workspacePath: string,
  agentId?: string,
  agentName?: string
): Promise<string> {
  const filePath = resolvePath(input.path, workspacePath);

  // Validate inputs
  if (!input.old_text) {
    throw new Error('old_text is required and cannot be empty');
  }

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
    // Use the native edit IPC handler for atomic replacement
    const result = await window.electronAPI.fs.edit(filePath, input.old_text, input.new_text);

    if (!result.success) {
      throw new Error(result.error || 'Edit failed');
    }

    // Release lock on success
    if (operationId) {
      useFileLockStore.getState().releaseOperation(operationId);
    }

    const relativePath = filePath.replace(workspacePath, '').replace(/^[/\\]/, '');
    const changeSize = Math.abs(result.charDiff || 0);
    const changeType = (result.charDiff || 0) > 0 ? 'added' : 'removed';
    const occurrences = result.occurrences || 1;

    return `Successfully edited ${relativePath}\n- Replaced ${input.old_text.length} chars with ${input.new_text.length} chars (${changeSize} chars ${changeType})${occurrences > 1 ? `\n- Note: ${occurrences - 1} other occurrence(s) were not replaced` : ''}`;
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

/**
 * Main executor for efficient tools
 */
export async function executeEfficientTool(
  name: string,
  input: Record<string, unknown>,
  workspacePath: string,
  agentId?: string,
  agentName?: string
): Promise<string> {
  switch (name) {
    case 'grep':
      return executeGrep(input as unknown as GrepInput, workspacePath);

    case 'glob':
      return executeGlob(input as unknown as GlobInput, workspacePath);

    case 'edit':
      return executeEdit(input as unknown as EditInput, workspacePath, agentId, agentName);

    default:
      throw new Error(`Unknown efficient tool: ${name}`);
  }
}
