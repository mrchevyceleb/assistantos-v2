# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AssistantOS is an Electron-based desktop application that provides a personal AI assistant interface with file management capabilities and Claude-powered agent functionality. Built with React, TypeScript, Vite, and Tailwind CSS.

## Development Commands

### Running the App
- `npm run dev` - Start development server with hot reload (runs Vite dev server on port 5173 and Electron concurrently)
- `npm run dev:vite` - Run only the Vite dev server
- `npm run dev:electron` - Run only Electron (waits for Vite to start on port 5173)

### Building
- `npm run build` - Compile TypeScript and build Vite bundle
- `npm run build:electron` - Build production Electron app (creates installers in `release/` directory)
- `npm run preview` - Preview production build

### TypeScript Compilation
- `tsc -p tsconfig.node.json` - Compile Electron main/preload files to `dist-electron/`
- TypeScript for React app is handled by Vite (no emit mode in tsconfig.json)

## Architecture

### Electron Architecture

**Main Process** (`electron/main.ts`):
- Creates frameless BrowserWindow with custom title bar
- Handles IPC for window controls (minimize, maximize, close)
- Provides file system operations via IPC handlers:
  - `fs:readDir` - Read directory contents
  - `fs:readFile` - Read file contents
  - `fs:writeFile` - Write file contents
  - `fs:selectFolder` - Open folder selection dialog
  - `fs:createDir` - Create directories
  - `fs:exists` - Check file/directory existence
- Provides bash/shell command execution:
  - `bash:execute` - Execute shell commands (PowerShell on Windows, bash on Mac/Linux)
- Dev mode: loads `http://localhost:5173` with DevTools
- Production: loads from `dist/index.html`

**Preload Script** (`electron/preload.ts`):
- Exposes `window.electronAPI` to renderer via context bridge
- Provides type-safe IPC communication between renderer and main process
- Exposes `fs` and `bash` APIs

### Claude Agent Architecture

**Claude Service** (`src/services/claude.ts`):
- Initializes Anthropic SDK with user's API key
- Implements streaming chat with tool use
- Manages conversation history
- Implements agentic loop: `while(tool_use) → execute → feed results → repeat`
- Max 20 iterations per request for safety

**Tool System** (`src/services/tools/`):
- `schemas.ts` - Tool definitions following Anthropic's format
- `index.ts` - Tool registry and executor factory
- `fileTools.ts` - File system tool handlers (read, write, list, exists, mkdir)
- `bashTool.ts` - Shell command execution handler

**Available Tools**:
| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create file |
| `list_directory` | List directory contents |
| `file_exists` | Check if path exists |
| `create_directory` | Create new directory |
| `bash` | Execute shell commands |

### React Application Structure

**State Management** (`src/stores/appStore.ts`):
- Uses Zustand with persistence middleware
- State stored in `assistantos-storage` localStorage key
- Manages:
  - Workspace path
  - Current file and open files array
  - Anthropic API key
  - UI state (sidebar/chat collapsed states)

**Component Layout**:
- `App.tsx` - Root component with TitleBar and PanelLayout
- `PanelLayout.tsx` - Three-panel resizable layout using `react-resizable-panels`:
  - Left: FileTree (20% default, 15% min)
  - Center: MarkdownEditor (45% default, 20% min)
  - Right: AgentChat (35% default, 20% min)

**Key Components**:
- `TitleBar.tsx` - Custom window controls for frameless window
- `FileTree.tsx` - File system navigation
- `MarkdownEditor.tsx` - Monaco-based editor
- `AgentChat.tsx` - Chat interface with Claude agent (streaming, tool use, conversation history)

### Styling

Uses Tailwind with custom theme extending:
- Custom color palette: metallic dark backgrounds, cyan/violet/pink accents
- Custom shadows: glow effects and metallic depth
- Custom gradients: metallic sheens and glows
- Font families: Outfit (display), DM Sans (body)

Input styles use `.input-metallic` and `.btn-primary` classes defined in component CSS files.

## Path Aliases

TypeScript and Vite configured with `@/*` alias pointing to `src/*` directory.

## Build Output

- `dist/` - Vite build output (React app)
- `dist-electron/` - Compiled Electron TypeScript files
- `release/` - Electron-builder output (installers for win/mac/linux)

## API Integration

The app uses the Anthropic SDK (`@anthropic-ai/sdk`) for Claude integration:
- API key stored in Zustand state (persisted to localStorage)
- SDK initialized with `dangerouslyAllowBrowser: true` for client-side use
- Uses `claude-sonnet-4-20250514` model
- Streaming enabled for real-time responses
- Tool use enabled for file/bash operations

## Development Notes

- The app uses ES modules (`"type": "module"` in package.json)
- Electron files use `import.meta.url` for `__dirname` equivalent
- Window is frameless with custom title bar and traffic light positioning for macOS
- File operations are async and go through Electron IPC for security
- Shell commands use PowerShell on Windows, bash on Mac/Linux
- Path resolution uses `path-browserify` for browser compatibility

## Future Enhancements

Planned layers to add:
- Conversation persistence (save/load chats)
- Context compaction (handle long conversations)
- MCP integration (external services)
- Subagents (parallel task execution)
- Skills system (reusable workflows)
