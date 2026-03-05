/**
 * Shared Ctrl+Click link handling for chat and terminal.
 * - File paths: open as editor tab in AssistantOS
 * - URLs: open in the default browser via Tauri
 */
import { openTab, updateTabContent, setTabLoading } from '$lib/stores/tabs';
import { readFileText, getFileInfo } from '$lib/utils/tauri';
import { get } from 'svelte/store';
import { workspacePath } from '$lib/stores/workspace';

/** Pattern for common URLs */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/;

/**
 * Pattern for file paths. Matches:
 * - Windows: C:\foo\bar.ts, .\src\lib.ts
 * - Unix: /home/user/file.ts, ./src/lib.ts
 * - Relative: src/lib/foo.ts (with at least one slash and a file extension)
 * Optionally followed by :line or :line:col
 */
const FILE_PATH_RE = /(?:[A-Za-z]:[\\\/]|\.{0,2}[\\\/]|[a-zA-Z_][a-zA-Z0-9_\-./\\]*[\\\/])[^\s:*?"<>|]+(?::\d+(?::\d+)?)?/;

/** Extract a URL from text around a given offset */
function findUrlAt(text: string, offset: number): string | null {
  // Search in a window around the click position
  const start = Math.max(0, offset - 200);
  const end = Math.min(text.length, offset + 200);
  const window = text.slice(start, end);
  const adjustedOffset = offset - start;

  const matches = [...window.matchAll(new RegExp(URL_RE, 'g'))];
  for (const m of matches) {
    const mStart = m.index!;
    const mEnd = mStart + m[0].length;
    if (adjustedOffset >= mStart && adjustedOffset <= mEnd) {
      return m[0];
    }
  }
  return null;
}

/** Extract a file path from text around a given offset */
function findFilePathAt(text: string, offset: number): string | null {
  const start = Math.max(0, offset - 200);
  const end = Math.min(text.length, offset + 200);
  const window = text.slice(start, end);
  const adjustedOffset = offset - start;

  const matches = [...window.matchAll(new RegExp(FILE_PATH_RE, 'g'))];
  for (const m of matches) {
    const mStart = m.index!;
    const mEnd = mStart + m[0].length;
    if (adjustedOffset >= mStart && adjustedOffset <= mEnd) {
      return m[0];
    }
  }
  return null;
}

/** Resolve a potentially relative path against the workspace */
function resolvePath(filePath: string): string {
  const ws = get(workspacePath);
  if (!ws) return filePath;

  // Already absolute
  if (/^[A-Za-z]:/.test(filePath) || filePath.startsWith('/')) {
    return filePath;
  }

  // Strip leading ./ or .\
  let clean = filePath.replace(/^\.[\\/]/, '');
  const sep = ws.includes('\\') ? '\\' : '/';
  return `${ws}${sep}${clean}`;
}

/** Strip :line:col suffix and return [path, line] */
function parsePathAndLine(raw: string): [string, number | null] {
  const match = raw.match(/^(.+?):(\d+)(?::\d+)?$/);
  if (match) {
    return [match[1], parseInt(match[2], 10)];
  }
  return [raw, null];
}

/** Open a URL in the default browser */
async function openUrlInBrowser(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch (e) {
    console.error('Failed to open URL:', e);
  }
}

/** Open a file path in the editor */
async function openFileInEditor(rawPath: string): Promise<void> {
  const [pathPart] = parsePathAndLine(rawPath);
  const resolved = resolvePath(pathPart);

  try {
    const info = await getFileInfo(resolved);
    if (!info || info.is_dir) return;

    const name = resolved.split(/[\\/]/).pop() || resolved;
    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
    const tabId = openTab(resolved, name, ext);

    const content = await readFileText(resolved);
    updateTabContent(tabId, content);
  } catch {
    // File doesn't exist or can't be read, ignore
  }
}

/**
 * Handle a Ctrl+Click event on a text container.
 * Looks for URLs and file paths at the click position.
 * Returns true if a link was handled.
 */
export async function handleCtrlClick(e: MouseEvent, containerEl: HTMLElement): Promise<boolean> {
  if (!e.ctrlKey && !e.metaKey) return false;

  // Get the text content and try to find what was clicked
  const target = e.target as HTMLElement;

  // If it's an <a> tag, use its href directly
  if (target.tagName === 'A') {
    const href = target.getAttribute('href');
    if (href) {
      e.preventDefault();
      e.stopPropagation();
      if (href.startsWith('http://') || href.startsWith('https://')) {
        await openUrlInBrowser(href);
      } else {
        await openFileInEditor(href);
      }
      return true;
    }
  }

  // Otherwise, try to find a link in the text near the click
  const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
  if (!range) return false;

  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return false;

  const fullText = textNode.textContent || '';
  const offset = range.startOffset;

  // Try URL first
  const url = findUrlAt(fullText, offset);
  if (url) {
    e.preventDefault();
    e.stopPropagation();
    await openUrlInBrowser(url);
    return true;
  }

  // Try file path
  const filePath = findFilePathAt(fullText, offset);
  if (filePath) {
    e.preventDefault();
    e.stopPropagation();
    await openFileInEditor(filePath);
    return true;
  }

  return false;
}

/**
 * Terminal-specific: handler function for WebLinksAddon.
 * Opens URLs in the default browser when Ctrl+clicked.
 */
export function terminalLinkHandler(_event: MouseEvent, uri: string): void {
  openUrlInBrowser(uri);
}

/**
 * Terminal-specific: create an xterm ILinkProvider for file paths.
 * Returns a link provider that can be registered with term.registerLinkProvider().
 */
export function createFilePathLinkProvider(openFile: (path: string) => void) {
  return {
    provideLinks(bufferLineNumber: number, callback: (links: Array<{
      range: { start: { x: number; y: number }; end: { x: number; y: number } };
      text: string;
      activate: (event: MouseEvent, text: string) => void;
    }> | undefined) => void, _terminal: unknown) {
      // We can't easily read terminal buffer lines from here,
      // so we'll rely on the WebLinksAddon for URLs and handleCtrlClick for file paths
      callback(undefined);
    },
  };
}
