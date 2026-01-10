# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AssistantOS is an Electron-based desktop application that serves as your **personal AI executive assistant**. It's a versatile assistant capable of research, writing, organization, technical work, and problem-solving - with direct access to your file system and shell commands. Built with React, TypeScript, Vite, and Tailwind CSS.

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
- Exposes `fs`, `bash`, `shell`, and `mcp` APIs
- Shell API includes `openExternal(url)` to open links in native browser
- MCP API provides access to Model Context Protocol integrations (see MCP Integration section below)

### Claude Agent Architecture

**Claude Service** (`src/services/claude.ts`):
- Initializes Anthropic SDK with user's API key
- Implements streaming chat with tool use
- Manages conversation history
- Implements agentic loop: `while(tool_use) → execute → feed results → repeat`
- Max 20 iterations per request for safety

**System Prompt Architecture** (`src/services/systemPrompt.ts`, `src/services/contextService.ts`):

The AI agent uses a 3-layer system prompt that assembles at runtime:

| Layer | Source | Description |
|-------|--------|-------------|
| **Core Identity** | Built-in constant | Defines AssistantOS identity, capabilities, tool policies, safety guidelines |
| **Custom Instructions** | User-editable in settings | Personal preferences (coding style, communication, etc.) |
| **Dynamic Context** | Auto-gathered at runtime | Git status, platform, date, open files, workspace structure |

Files:
- `systemPrompt.ts` - Core prompt constant + `assembleSystemPrompt()` function
- `contextService.ts` - `gatherDynamicContext()` and `formatContextForPrompt()`

The assembled prompt is passed to Claude on every message, ensuring consistent identity and context awareness.

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
  - Selected model (Opus/Sonnet/Haiku)
  - UI state (sidebar/chat collapsed states)
  - Custom instructions (persisted, editable via settings panel)

**Component Layout**:
- `App.tsx` - Root component with TitleBar and PanelLayout
- `PanelLayout.tsx` - Three-panel resizable layout using `react-resizable-panels`:
  - Left: FileTree (20% default, 15% min)
  - Center: MarkdownEditor (45% default, 20% min)
  - Right: AgentChat (35% default, 20% min)

**Key Components**:
- `TitleBar.tsx` - Custom window controls for frameless window
- `FileTree.tsx` - File system navigation (auto-hides dotfiles starting with ".")
- `MarkdownEditor.tsx` - Milkdown-based WYSIWYG markdown editor with GFM support
- `AgentChat.tsx` - Chat interface with Claude agent (streaming, tool use, conversation history)

**External Links**:
- Links in markdown editor and chat are clickable and open in the OS native browser
- Uses Electron's `shell.openExternal()` via IPC for security

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
- **Model selection**: User can switch between Opus 4, Sonnet 4, and Haiku 3.5 mid-chat via dropdown in chat header
- Streaming enabled for real-time responses
- Tool use enabled for file/bash operations

### Available Models

| Model | ID | Description |
|-------|-----|-------------|
| Claude Opus 4 | `claude-opus-4-20250514` | Most capable, best for complex tasks |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | Balanced performance (default) |
| Claude Haiku 3.5 | `claude-haiku-3-5-20241022` | Fastest, best for quick tasks |

## Development Notes

- The app uses ES modules (`"type": "module"` in package.json)
- Electron files use `import.meta.url` for `__dirname` equivalent
- Window is frameless with custom title bar and traffic light positioning for macOS
- File operations are async and go through Electron IPC for security
- Shell commands use PowerShell on Windows, bash on Mac/Linux
- Path resolution uses `path-browserify` for browser compatibility
- FileTree auto-hides dotfiles (files/folders starting with ".") like .git, .obsidian, etc.

## MCP (Model Context Protocol) Integration

AssistantOS now includes support for MCP integrations, allowing the Claude agent to access external services and tools through standardized protocol handlers.

### MCP Architecture

**Files**:
- `electron/mcp/registry.ts` - Central registry of all available MCP integrations with @mention syntax
- `electron/mcp/MCPManager.ts` - Manages lifecycle of MCP server processes and client connections
- `electron/mcp/ipcHandlers.ts` - Electron IPC handlers bridging renderer to MCP Manager

**Preload API** (`electron/preload.ts`):
The MCP API is exposed via `window.electronAPI.mcp`:
- `getIntegrations()` - List all available integrations
- `getMentionMap()` - Get mention → integrationId mapping for @mentions in chat
- `getAllMentions()` - Get all mentions (primary + aliases) for autocomplete
- `configure(integrationId, config)` - Set environment variables/credentials for an integration
- `start(integrationId)` - Start an MCP server instance
- `stop(integrationId)` - Stop an MCP server instance
- `isReady(integrationId)` - Check if server is running and ready
- `getTools(integrationIds)` - Get available tools from one or more integrations
- `executeTool(integrationId, toolName, input)` - Execute a tool from an integration
- `findIntegrationForTool(toolName)` - Find which integration provides a tool
- `getStatus()` - Get status of all MCP servers
- `getConfig(integrationId)` - Get current configuration for an integration

### Available MCP Integrations

The registry defines 10+ integrations across 5 categories:

**Browser Automation**:
- `@browser`/`@playwright` - Local browser testing via Playwright
- `@cloud-browser`/`@browserbase` - Cloud browser automation with BrowserBase

**Google Services**:
- `@gmail`/`@email`/`@mail` - Multi-account email via Unified Gmail (OAuth)
- `@calendar`/`@cal`/`@schedule` - Calendar management via Google Calendar (OAuth)

**Search & Research**:
- `@perplexity`/`@pplx`/`@research` - AI-powered web search
- `@brave`/`@search`/`@web` - Privacy-focused search

**Cloud Platforms**:
- `@vercel`/`@deploy`/`@hosting` - Deployment and project management

**Media & Generation**:
- `@image`/`@img`/`@generate`/`@nanobanana` - AI image generation with Gemini

### MCP Server Lifecycle

1. **Registration** - Integrations defined in `registry.ts` with command, args, required env vars
2. **Configuration** - User provides API keys/credentials via settings panel
3. **Startup** - MCP server spawned as child process on first use
4. **Discovery** - Client establishes stdio connection and discovers available tools
5. **Execution** - Tools called by Claude agent during agentic loop
6. **Cleanup** - Servers stopped on app shutdown via `before-quit` handler

### MCP in Chat

Users trigger MCP tools via @mentions in chat:
- Type `@` to get autocomplete suggestions
- Mention activates the integration's tool context
- Claude agent can discover and call tools from mentioned integrations
- Tool results are displayed above assistant response (similar to native tools)

### State Management

The app store (`src/stores/appStore.ts`) manages:
- `integrationConfigs` - Persisted configuration for each MCP integration
- Environment variables and OAuth tokens
- UI state for integration settings panel

## Future Enhancements

Planned expansions:
- Conversation persistence (save/load chats)
- Context compaction (handle long conversations)
- Additional MCP integrations (GitHub, Slack, Discord, etc.)
- Subagents (parallel task execution across multiple MCPs)
- Skills system (reusable workflows combining tools)
- Project-level custom instructions (in addition to global)
- Streaming MCP tool results for long-running operations
