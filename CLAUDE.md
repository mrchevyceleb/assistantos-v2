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
- Registers MCP handlers on startup via `registerMCPHandlers()` from `electron/mcp/ipcHandlers.ts`
- Cleans up MCP servers on shutdown via `cleanupMCPHandlers()`
- Handles IPC for window controls (minimize, maximize, close)
- Provides file system operations via IPC handlers:
  - `fs:readDir` - Read directory contents
  - `fs:readFile` - Read file contents
  - `fs:writeFile` - Write file contents
  - `fs:selectFolder` - Open folder selection dialog
  - `fs:createDir` - Create directories
  - `fs:exists` - Check file/directory existence
  - `fs:searchFiles` - Search workspace files for @document mentions autocomplete
- Provides bash/shell command execution:
  - `bash:execute` - Execute shell commands (PowerShell on Windows, bash on Mac/Linux)
- Provides MCP integration handlers (see MCP section below)
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
  - Center panel view mode (editor/dashboard/tasks)
  - Starred document paths
  - Task display settings (show completed, sort order, group by file)

**Component Layout**:
- `App.tsx` - Root component with TitleBar and PanelLayout
- `PanelLayout.tsx` - Three-panel resizable layout using `react-resizable-panels`:
  - Left: FileTree with StarredSection (20% default, 15% min)
  - Center: Tabbed view with CenterPanelTabs (45% default, 20% min)
    - Editor tab: MarkdownEditor
    - Dashboard tab: Dashboard with widgets
    - Tasks tab: TaskPanel for task management
  - Right: AgentChat (35% default, 20% min)
- Keyboard shortcuts: Ctrl+1 (Editor), Ctrl+2 (Dashboard), Ctrl+3 (Tasks)

**Key Components**:
- `TitleBar.tsx` - Custom window controls for frameless window
- `FileTree.tsx` - File system navigation (auto-hides dotfiles starting with ".")
- `MarkdownEditor.tsx` - Milkdown-based WYSIWYG markdown editor with GFM support
- `AgentChat.tsx` - Chat interface with Claude agent
  - Imports organized by category: React, libraries, store, services, components
  - Helper functions:
    - `readDocumentContext()` - Reads file contents and formats as XML for Claude
    - `prepareMCPTools()` - Fetches and merges MCP tools with native tools
  - Chunk handlers (separated for clarity):
    - `handleTextChunk()` - Append streamed text to assistant message
    - `handleToolUseChunk()` - Insert tool execution message before assistant
    - `handleToolResultChunk()` - Update tool message with execution result
    - `handleErrorChunk()` - Append error messages to assistant content
  - State management:
    - `messages` - Chat message history with role, content, tool metadata
    - `input` - Current input text
    - `mentionSuggestions` - Autocomplete dropdown suggestions
    - `activeMentions` - Integration IDs from parsed message
    - `activeDocuments` - Document references from parsed message
  - Keyboard shortcuts:
    - Arrow Up/Down - Navigate mention suggestions
    - Tab/Enter - Select suggestion
    - Escape - Close suggestions
    - Enter - Send message (Shift+Enter for multiline)

### Dashboard Panel

The Dashboard provides a configurable overview with widgets for quick information access.

**Components** (`src/components/dashboard/`):
- `Dashboard.tsx` - Main container with greeting, date display, and widget grid
- `WidgetContainer.tsx` - Reusable wrapper with header, loading state, and refresh button
- `CalendarWidget.tsx` - Upcoming calendar events via MCP @calendar integration
- `TaskSummaryWidget.tsx` - Task statistics with progress bar (open, overdue, high priority)
- `QuickLinksWidget.tsx` - Starred files for quick access

**Features**:
- Dynamic greeting based on time of day
- Calendar integration with MCP (shows configure CTA if not set up)
- Links to Task panel for detailed task management
- Starred files quick access with click-to-open

### Task Management Panel

The Task panel provides a UI for managing tasks extracted from markdown files.

**Components** (`src/components/tasks/`):
- `TaskPanel.tsx` - Main container with header, filters, and task list
- `TaskFilters.tsx` - Filter controls (show/hide completed, sort by file/date/priority)
- `TaskList.tsx` - Renders tasks with optional grouping by file
- `TaskItem.tsx` - Individual task row with checkbox, metadata badges, file link

**Task Parser Service** (`src/services/taskParser.ts`):
- Scans all `.md` files in workspace for task checkboxes
- Parses `- [ ]` (incomplete) and `- [x]` (complete) patterns
- Extracts optional metadata:
  - Due dates: `@due(2024-01-15)` or `@due(tomorrow)`
  - Priority: `!high`, `!medium`, `!low`
- Functions:
  - `parseTasksFromWorkspace()` - Scans workspace and returns parsed tasks
  - `toggleTaskInFile()` - Updates checkbox state in source file
  - `getFileName()` - Extracts filename from path for display

**Task Type** (`src/types/task.ts`):
```typescript
interface ParsedTask {
  id: string
  text: string
  completed: boolean
  filePath: string
  lineNumber: number
  dueDate?: string
  priority?: 'high' | 'medium' | 'low'
  raw: string
}
```

### Starred Documents

Quick access bookmarks for frequently used files.

**Components**:
- `StarredSection.tsx` - Collapsible section at top of FileTree showing starred files
- Star toggle button appears on file hover in FileTree

**Features**:
- Star/unstar files by clicking the star icon on hover
- Starred files shown in amber with filled star icon
- Collapsible section with file count badge
- Click starred file to open, click star to unstar
- Persisted to localStorage via Zustand

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

**Electron File System** (`electron/main.ts`):
- File search implementation for @document mentions:
  - Constants: `FILE_SEARCH_MAX_RESULTS`, `FILE_SEARCH_MAX_DEPTH`, `EXCLUDED_DIRECTORIES`
  - `searchDirectoryRecursively()` - Async recursive directory traversal with max depth control
  - `sortSearchResults()` - Sorts results: exact matches first, then by path length
  - Excludes: node_modules, .git, dist, build, coverage, __pycache__, .next, .cache

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

### @Mention System

The @mention system supports two types of mentions:

**1. Integration Mentions (MCP)**
- Type `@` followed by an integration name (e.g., `@gmail`, `@calendar`)
- Activates the integration's tool context
- Claude agent can discover and call tools from mentioned integrations
- Tool results are displayed above assistant response

**2. Document Mentions**
- Type `@` followed by a filename or path from your workspace
- Autocomplete searches your workspace files as you type
- Selected documents have their content automatically injected into the message
- Content is wrapped in `<referenced_documents>` XML tags for Claude

**Autocomplete UI**:
- Shows up to 10 suggestions (integrations first, then documents)
- Integrations shown with 🔌 icon in cyan
- Documents shown with 📄 (file) or 📁 (folder) icon in violet
- Use Tab/Enter to select, Arrow keys to navigate, Escape to close

**Mention Parser** (`src/services/mentions/parser.ts`):
- Unified mention parsing for integrations and workspace documents
- Regex patterns:
  - `MENTION_WITH_PATHS_REGEX` - Matches @word, @path/to/file, @file.ext (paths with slashes, dots)
  - `MENTION_SIMPLE_REGEX` - Matches @word only (integrations)
- Functions:
  - `parseMessage()` - Extracts both integration and document mentions from input
  - `getFileMentionSuggestions()` - Searches workspace for file matches
  - `getUnifiedSuggestions()` - Combined autocomplete with integrations first (limit 5), then files (limit 7)
  - `getMentionSuggestions()` - Integration mentions only
  - `getPartialMention()` - Extract partial mention at cursor
  - `completeMention()` - Insert completed mention with trailing space
  - `extractMentionsSync()` - Quick sync extraction using cached mention map
  - `stripMentions()` - Remove all mentions from text
  - `highlightMentions()` - Segment text into mention/non-mention parts
- Types: `MentionSuggestion` (integrations), `FileMentionSuggestion` (documents), `UnifiedSuggestion` (combined)

### State Management

The app store (`src/stores/appStore.ts`) manages:
- `integrationConfigs` - Persisted configuration for each MCP integration
- Environment variables and OAuth tokens
- UI state for integration settings panel

## Future Enhancements

Planned expansions:
- Conversation persistence (save/load chats)
- **Context management** - Token counting, usage monitoring, auto-save on overflow (see `docs/CONTEXT_MANAGEMENT_PLAN.md`)
- Additional MCP integrations (GitHub, Slack, Discord, etc.)
- Subagents (parallel task execution across multiple MCPs)
- Skills system (reusable workflows combining tools)
- Project-level custom instructions (in addition to global)
- Streaming MCP tool results for long-running operations
- Configurable dashboard widget arrangement
- Task creation from dashboard
- Calendar event creation/editing via dashboard
