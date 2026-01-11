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
  - `fs:rename` - Rename files/folders
  - `fs:delete` - Delete files/folders (recursive for directories)
  - `fs:copyPath` - Copy file path to clipboard
  - `fs:showInExplorer` - Open file in system file explorer
  - `fs:getInfo` - Get file metadata (size, dates, type)
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
| `create_mcp_integration` | Create a custom MCP integration from npm package |

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
  - Editor font size (12px-32px, default 16px)

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
  - Draggable file/folder entries for drag-and-drop to chat
  - Grip handle indicator shows on hover
  - Right-click context menu with file operations (see Context Menu section below)
- `MarkdownEditor.tsx` - Milkdown-based WYSIWYG markdown editor with GFM support
  - Adjustable font size (12px-32px) via toolbar controls
  - Keyboard shortcuts: Ctrl+Plus (increase), Ctrl+Minus (decrease), Ctrl+0 (reset to 16px)
  - Font size persists across sessions
- `MediaViewer.tsx` - Native media file viewer for images, videos, and audio
  - Automatically displays when media files are clicked in FileTree
  - Supported formats:
    - **Images**: .png, .jpg, .jpeg, .gif, .webp, .bmp, .ico, .svg
    - **Videos**: .mp4, .webm, .mov, .avi
    - **Audio**: .mp3, .wav, .ogg, .m4a
  - Features:
    - Images: Zoom controls (25%-400%), fullscreen, dimension display
    - Videos: Native video player with controls, zoom, fullscreen
    - Audio: Native audio player with album art placeholder
  - File type detection via `src/utils/fileTypes.ts`
- `AgentChat.tsx` - Chat interface with Claude agent
  - Drag-and-drop files/folders to add as @mentions
  - Drop overlay shows when dragging over chat area
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

### Kanban Board (Task Management)

The Tasks panel provides a Kanban board for managing tasks with a standardized folder structure.

**Folder Structure** (standardized):
```
TASKS/                    # Fixed location at workspace root
├── ProjectName/          # One folder per project
│   ├── tasks.md          # Main task file
│   └── *.md              # Additional task files
└── AnotherProject/
    └── tasks.md
```

**Extended Checkbox Syntax** (Kanban statuses):
| Checkbox | Status | Description |
|----------|--------|-------------|
| `- [ ]` | Backlog | Task not yet scheduled |
| `- [o]` | Todo | Task scheduled to do |
| `- [>]` | In Progress | Currently working on |
| `- [?]` | In Review | Awaiting review |
| `- [x]` | Done | Completed |

**Components** (`src/components/tasks/`):
- `TaskPanel.tsx` - Main container with Kanban board and project selector
- `KanbanBoard.tsx` - 5-column Kanban layout with drag-and-drop
- `KanbanColumn.tsx` - Single column with header and task list
- `KanbanCard.tsx` - Task card with metadata badges
- `ProjectSelector.tsx` - Dropdown to switch between projects or view all

**Task Parser Service** (`src/services/taskParser.ts`):
- Scans only `TASKS/` folder at workspace root
- Parses extended checkbox syntax for 5 statuses
- Extracts project name from folder structure
- Extracts optional metadata:
  - Due dates: `@due(2024-01-15)` or `@due(tomorrow)`
  - Priority: `!high`, `!medium`, `!low`
- Functions:
  - `parseTasksFromWorkspace(workspacePath, projectFilter?)` - Scans TASKS folder
  - `updateTaskStatus(filePath, lineNumber, newStatus)` - Updates checkbox in file
  - `getProjectList(workspacePath)` - Get list of project folders
  - `createProject(workspacePath, projectName)` - Create new project folder

**Task Types** (`src/types/task.ts`):
```typescript
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'

interface ParsedTask {
  id: string
  text: string
  status: TaskStatus           // Kanban status
  completed: boolean           // true when status === 'done'
  filePath: string
  lineNumber: number
  projectName: string          // Extracted from folder name
  dueDate?: string
  priority?: 'high' | 'medium' | 'low'
  raw: string
}

interface KanbanSettings {
  selectedProject: string | null  // null = show all projects
  hideEmptyColumns: boolean
  showCompletedTasks: boolean
}
```

**Features**:
- Drag-and-drop between columns (updates markdown file automatically)
- Project selector to filter by project or view all
- Toggle to show/hide completed tasks
- Create new projects from the UI
- Dashboard widget shows status breakdown

### Workspace Onboarding

AI-driven workspace setup for new users.

**Components**:
- `OnboardingWidget.tsx` - Dashboard widget with setup options
- `onboardingPrompt.ts` - Prompt templates for AI-guided setup

**Features**:
- Shows on Dashboard when workspace hasn't been onboarded
- **Guided Setup** - AI asks about work style, creates personalized folder structure
- **Quick Setup** - Instantly creates standard productivity folder structure
- **Skip option** - Mark workspace as onboarded without changes

**Onboarding State** (`src/stores/appStore.ts`):
- `onboardedWorkspaces: string[]` - Tracks which workspaces completed onboarding
- `pendingChatPrompt: string | null` - Allows programmatic chat prompt injection

**Recommended Folder Structure**:
```
TASKS/              # Standardized Kanban task management
  Project1/         # One folder per project
    tasks.md        # Project tasks with extended checkboxes
  Project2/
    tasks.md
00-Inbox/           # Capture new items
01-Active/          # Active work (non-task files)
02-Someday/         # Deferred items
03-Reference/       # Reference materials
04-Archive/         # Completed work
Templates/          # Reusable templates
README.md           # Workspace guide
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

### File Context Menu

Right-click context menu for file/folder operations in the FileTree.

**Components** (`src/components/filetree/`):
- `FileContextMenu.tsx` - Portal-based context menu with file operations
- `DeleteConfirmDialog.tsx` - Confirmation dialog for delete operations
- `NewItemDialog.tsx` - Dialog for creating new files/folders

**Context Menu Actions**:
| Action | Description | Shortcut |
|--------|-------------|----------|
| New File | Create a new file in the folder (folders only) | - |
| New Folder | Create a new folder inside (folders only) | - |
| Send to Chat | Insert file as @mention in chat input | - |
| Copy Path | Copy full file path to clipboard | - |
| Show in Explorer | Open containing folder in system file manager | - |
| Rename | Inline rename with validation | F2 |
| Delete | Delete with confirmation dialog | Delete |

**Features**:
- Portal-based rendering for proper z-index handling
- Auto-positions to stay within viewport bounds
- Inline rename input with filename pre-selected (without extension for files)
- Delete confirmation with warning for folders (recursive delete)
- New file/folder dialogs with name validation
- Keyboard shortcuts (F2 for rename, Delete for delete) when file is selected
- ESC to cancel operations

**State Management** (in FileTree.tsx):
- `contextMenu` - Position and target entry for context menu
- `renameState` - Currently renaming file path and original name
- `deleteTarget` - File entry pending deletion confirmation
- `newItemState` - Type (file/folder) and parent path for creation dialog

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

The registry defines 10 built-in integrations across 5 categories:

**Browser Automation**:
- `@browser`/`@playwright` - Local browser testing via Microsoft Playwright (`@playwright/mcp`)
- `@cloud-browser`/`@browserbase`/`@stagehand` - Cloud browser with AI (`@browserbasehq/mcp-server-browserbase`)

**Google Services**:
- `@gmail`/`@email`/`@mail` - Email with auto-auth (`@gongrzhe/server-gmail-autoauth-mcp`)
- `@calendar`/`@cal`/`@schedule` - Multi-account calendar (`@cocal/google-calendar-mcp`)

**Search & Research**:
- `@perplexity`/`@pplx`/`@research` - AI-powered search, research, reasoning (`@perplexity-ai/mcp-server`)
- `@brave`/`@search`/`@web` - Privacy-focused web search (`@brave/brave-search-mcp-server`)
- `@docs`/`@context7`/`@documentation` - Up-to-date library documentation (`@upstash/context7-mcp`)

**Cloud Platforms**:
- `@vercel`/`@deploy`/`@hosting` - Deployment and project management (`@open-mcp/vercel`)

**Media & Generation**:
- `@image`/`@img`/`@generate`/`@nanobanana` - AI image generation with Gemini 3 Pro (`gemini-nanobanana-mcp`)

### Custom MCP Integrations

Users can add their own MCP integrations in two ways:

1. **Via Chat** - Ask the AI to add an integration from a GitHub URL or description:
   - "Add the GitHub MCP server from https://github.com/modelcontextprotocol/servers/tree/main/src/github"
   - "I want a Slack integration"

2. **Via Settings UI** - Settings > Integrations > Custom > Add Integration

**Custom Integration Features**:
- Persist across sessions (stored in localStorage)
- Full configuration (env vars, @mentions, categories)
- Edit/delete custom integrations
- Same capabilities as built-in integrations

**Tool**: `create_mcp_integration` - Creates a custom integration from npm package

### MCP Server Lifecycle

1. **Registration** - Integrations defined in `registry.ts` or added via `registerCustomIntegration()`
2. **Persistence** - Custom integrations stored in app store (localStorage)
3. **Configuration** - User provides API keys/credentials via settings panel (with "Get API Key" links)
4. **Startup** - MCP server spawned as child process on first use
5. **Discovery** - Client establishes stdio connection and discovers available tools
6. **Execution** - Tools called by Claude agent during agentic loop
7. **Cleanup** - Servers stopped on app shutdown via `before-quit` handler

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

## Persistent Memory System

AssistantOS includes a persistent memory system that stores user facts, preferences, and conversation summaries across sessions using Supabase.

### Memory Architecture

**Files**:
- `src/services/memory/types.ts` - TypeScript interfaces for memory types
- `src/services/memory/supabaseClient.ts` - Supabase connection management
- `src/services/memory/extractionService.ts` - Extract facts/preferences from conversations
- `src/services/memory/retrievalService.ts` - Retrieve relevant memories with token budgeting
- `src/services/memory/index.ts` - Export all memory functionality
- `electron/memory/ipcHandlers.ts` - IPC handlers for memory operations
- `electron/memory/embeddingService.ts` - OpenAI embedding generation for semantic search
- `supabase/migrations/20260111001800_memory_tables.sql` - Database schema

**Database Tables** (Supabase):
| Table | Purpose |
|-------|---------|
| `memory_users` | Anonymous user identification for cross-device sync |
| `user_profiles` | Core profile (name, role, company, tech stack) |
| `user_facts` | Explicit facts learned from conversations |
| `user_preferences` | Learned behavioral preferences |
| `conversation_summaries` | Summaries of past conversations |

### Memory Flow

1. **Extraction** - When conversations are saved, facts and preferences are extracted using pattern matching
2. **Storage** - Extracted memories stored in Supabase with keywords and optional embeddings
3. **Retrieval** - Before sending messages, relevant memories fetched using semantic search (if embeddings enabled) or keyword matching
4. **Injection** - Memories injected into system prompt (~1000 tokens max budget)

### AI Embeddings (Semantic Search)

The memory system supports optional OpenAI embeddings for smarter memory retrieval:

**Configuration**:
- Add OpenAI API key in Settings → Memory → OpenAI API Key
- Uses `text-embedding-3-small` model (1536 dimensions)
- Status indicator shows when embeddings are enabled

**How it works**:
1. When facts/summaries are saved, embeddings are generated and stored in pgvector columns
2. When retrieving memories, the query is embedded and compared semantically
3. RPC functions `search_facts_by_embedding()` and `search_summaries_by_embedding()` perform vector similarity search
4. Falls back to keyword search if OpenAI key not configured

**Cost**: ~$0.02 per 1M tokens - essentially free for typical usage

**Database Support**:
- pgvector extension enabled in Supabase
- `embedding vector(1536)` columns on `user_facts` and `conversation_summaries`

### Token Budget

| Component | Budget |
|-----------|--------|
| Profile | ~400 tokens |
| Facts | ~300 tokens |
| Preferences | ~100 tokens |
| Summaries | ~200 tokens |
| **Total** | ~1000 tokens |

### Cross-Device Sync

- Anonymous UUID generated on first app launch
- UUID can be copied and imported on other devices
- All memories synced via Supabase using the same UUID

### Settings UI

Memory configuration in Settings modal (`src/components/settings/SettingsModal.tsx`):
- Enable/disable toggle
- Supabase URL and anon key inputs
- OpenAI API key (optional, for semantic search)
- Memory ID display with copy button
- Import Memory ID from another device
- Connection status indicator
- Embeddings status indicator (green when enabled)

### Memory Indicator

When memory is enabled, an amber "Memory" indicator appears in the chat header next to the model selector.

## Future Enhancements

Planned expansions:
- ~~Conversation persistence (save/load chats)~~ (Implemented)
- **Context management** - Token counting, usage monitoring, auto-save on overflow (see `docs/CONTEXT_MANAGEMENT_PLAN.md`)
- Additional MCP integrations (GitHub, Slack, Discord, etc.)
- Subagents (parallel task execution across multiple MCPs)
- Skills system (reusable workflows combining tools)
- Project-level custom instructions (in addition to global)
- Streaming MCP tool results for long-running operations
- Configurable dashboard widget arrangement
- Task creation from dashboard
- Calendar event creation/editing via dashboard
