# CLAUDE.md

Guidance for Claude Code working with this repository.

## Project Overview

AssistantOS is an Electron desktop app - a personal AI executive assistant with file system and shell access. Built with React, TypeScript, Vite, and Tailwind CSS.

## Dev Commands

**Running**: `npm run dev` (Vite + Electron), `npm run dev:vite`, `npm run dev:electron`
**Building**: `npm run build`, `npm run build:electron`, `npm run preview`
**Compilation**: `tsc -p tsconfig.node.json` (Electron files only)

## Architecture Overview

### Electron Main Process (`electron/main.ts`)
- Frameless window with custom title bar
- IPC handlers for file system operations: `fs:readDir`, `fs:readFile`, `fs:readFileBase64`, `fs:writeFile`, `fs:selectFolder`, `fs:createDir`, `fs:exists`, `fs:rename`, `fs:delete`, `fs:copyPath`, `fs:showInExplorer`, `fs:getInfo`, `fs:searchFiles`, `fs:searchContent`
- Shell execution: `bash:execute` (PowerShell on Windows, bash on Mac/Linux)
- MCP integration handlers via `registerMCPHandlers()` and `cleanupMCPHandlers()`
- Dev: loads `http://localhost:5173`, Production: loads `dist/index.html`

### Preload Script (`electron/preload.ts`)
Exposes `window.electronAPI` with: `fs`, `bash`, `shell`, `mcp` APIs via context bridge.

### Claude Agent (`src/services/claude.ts`)
- Streaming chat with tool use via Anthropic SDK
- Agentic loop: detect tool_use → execute → feed results → repeat (max 20 iterations)
- Manages conversation history

### System Prompt (`src/services/systemPrompt.ts`, `src/services/contextService.ts`)
3-layer prompt assembly at runtime:
1. **Core Identity** - Built-in constant (capabilities, policies, guidelines)
2. **Custom Instructions** - User preferences (editable in settings)
3. **Dynamic Context** - Auto-gathered (git status, platform, date, workspace)

### Tools (`src/services/tools/`)
Available tools: `read_file`, `write_file`, `list_directory`, `file_exists`, `create_directory`, `bash`, `create_mcp_integration`

### State Management (`src/stores/appStore.ts`)
Zustand store with localStorage persistence (`assistantos-storage`):
- Workspace path, current file, open files
- API key, model selection (Opus/Sonnet/Haiku)
- UI state (sidebar/chat collapsed, panel view mode)
- Custom instructions, starred docs, quick notes, task settings
- Integration configs, shortcuts, memory settings
- Profile & avatar settings (user picture, agent avatar type/custom/preset)

### Component Layout
```
┌─────────────┬──────────────────────────────────────┐
│ Sidebar     │ [Tab1] [Tab2] [Tab3] [+]             │
│ (220px)     ├──────────────────────────────────────┤
│ Dashboard   │ Tab Content (Chat/Editor/Dashboard   │
│ AGENTS      │           /Tasks/Browser)            │
│ Tasks       │                                      │
│ NOTES       │                                      │
│ FILES       │                                      │
│ ⚙️ MCPs     │                                      │
└─────────────┴──────────────────────────────────────┘
```

**Key Components**:
- `App.tsx` - Root with TitleBar + AppLayout
- `AppLayout.tsx` - Sidebar + TabBar + TabContent
- `Sidebar.tsx` - Dashboard, Agents, Tasks, Notes, Files, Settings
- `TabBar.tsx` - Dynamic tabs (agent, file, browser, dashboard, tasks, ludicrous)
- `TabContent.tsx` - Renders active tab
- `FileTree.tsx` - Navigation (auto-hides dotfiles), drag-drop to chat, context menu
- `MarkdownEditor.tsx` - Milkdown WYSIWYG with GFM, adjustable font (12-32px)
- `MediaViewer.tsx` - Images, video, audio with zoom/fullscreen
- `AgentChat.tsx` - Chat interface with @mentions, drag-drop files, grouped tool display, customizable avatars

### Profile & Avatars
Customizable avatars for user and agent in chat messages (Settings > Profile & Avatars):

**User Profile Picture**:
- Upload custom image (resized to 200px for storage)
- Circular avatar with pink accent border
- Falls back to User icon if not set

**Agent Avatar** (3 types):
- **Default**: Classic cyan-purple gradient with Bot icon
- **Preset**: 10 icon options (Bot, Brain, Sparkles, Cpu, Zap, Terminal, Wand, Atom, Globe, Star)
- **Custom**: Upload custom image

**State** (in appStore):
- `userProfilePicture: string | null` - base64 data URL
- `agentAvatarType: 'default' | 'custom' | 'preset'`
- `agentCustomAvatar: string | null` - base64 data URL
- `agentPresetAvatar: PresetAvatarId | null` - preset icon id

**Keyboard Shortcuts**:
- Global: `Ctrl+T` (new agent), `Ctrl+W` (close), `Ctrl+Tab` (next), `Ctrl+L` (LUDICROUS MODE), `Ctrl+P` (file search)
- Editor: `Ctrl+S` (save), `Ctrl+B/I` (bold/italic), `Ctrl+K` (link), `Ctrl+±` (font), `Ctrl+Shift+S` (strikethrough)
- FileTree: `Enter` (open), `F2` (rename), `Delete` (delete), `Ctrl+C` (copy path)

### Dashboard Panel (`src/components/dashboard/`)
- `Dashboard.tsx` - Greeting header, widget grid
- `GreetingHeader.tsx` - Time-based greeting, live clock
- `ClockWidget.tsx` - Digital clock (12/24h format)
- `WeatherWidget.tsx` - Current + 2-day forecast via wttr.in
- `CalendarWidget.tsx` - Today's events via @calendar MCP
- `TaskSummaryWidget.tsx` - Task statistics
- `QuickLinksWidget.tsx` - Starred files
- `Next48HoursWidget.tsx` - Tasks + calendar events merged

**Settings** (in appStore): `weatherLocation`, `temperatureUnit`, `clockFormat`, `showSeconds`

### Task Management (`src/components/tasks/`, `src/services/taskParser.ts`)

Two conventions (auto-detected):

**1. Filename-based (RECOMMENDED)**
```
tasks/ProjectA - Task Title - Due 2026-01-15.md
```
Format: `{Project} - {Title} - Due {YYYY-MM-DD}.md`. Status from checkbox completion (0% → todo, 1-99% → in_progress, 100% → done).

**2. Subfolder structure (legacy)**
```
TASKS/ProjectName/tasks.md  (with - [x], - [o], - [>], - [?], - [ ] checkboxes)
```

**Components**: TaskPanel, KanbanBoard, KanbanColumn, KanbanCard, TaskListView, TaskListRow

**Parser functions**: `parseTasksFromWorkspace()`, `getProjectList()`, `updateTaskStatus()`, `calculateStatusFromContent()`

**Types** (`src/types/task.ts`): `TaskStatus`, `ParsedTask`, `KanbanSettings`

### Multi-Agent Support (`src/stores/agentStore.ts`, `src/stores/tabStore.ts`, `src/stores/fileLockStore.ts`)

- Up to 5 parallel agents with isolated conversation history
- Per-agent model selection
- Status indicators: ● idle, ◐ working, ○ queued, ✕ error
- Auto-naming via Claude Haiku
- File lock store prevents conflicts (queue-based locking)

**LUDICROUS MODE**: Grid view of all agents (`Ctrl+L`)

### MCP Integration (`electron/mcp/`)

**Architecture**:
- `registry.ts` - Central registry of integrations with @mention syntax
- `MCPManager.ts` - Lifecycle management of MCP server processes
- `ipcHandlers.ts` - IPC bridge from renderer to MCP Manager

**Built-in Integrations**:
- **Browser**: `@browser`/`@playwright` (Playwright), `@cloud-browser`/`@browserbase` (Browserbase)
- **Google**: `@gmail`/`@email` (Gmail), `@calendar`/`@cal` (Calendar)
- **Search**: `@perplexity`/`@research`, `@brave`/`@web`, `@docs`/`@documentation`
- **Cloud**: `@vercel`/`@deploy` (Vercel)
- **Media**: `@image`/`@generate` (Gemini image generation)

**Custom Integrations**: Via chat or Settings UI. Tool: `create_mcp_integration`

**Preload API** (`window.electronAPI.mcp`): `getIntegrations()`, `configure()`, `start()`, `stop()`, `isReady()`, `getTools()`, `executeTool()`, `getStatus()`, etc.

### @Mention System (`src/services/mentions/parser.ts`)

Two types of mentions:
1. **Integration**: `@gmail`, `@calendar` (activates tool context)
2. **Document**: `@file.md`, `@path/to/file` (injects content)

**Functions**: `parseMessage()`, `getFileMentionSuggestions()`, `getUnifiedSuggestions()`, `extractMentionsSync()`, `stripMentions()`, `highlightMentions()`

**Autocomplete**: Shows integrations (🔌 cyan) first, then documents (📄 violet), limit 10 total. Tab/Enter to select.

### Slash Commands (`src/types/shortcut.ts`, `src/services/shortcuts/parser.ts`)

Type `/` to see shortcuts. Built-in: `/intake`, `/morning`, `/check-email`, `/check-calendar`, `/research`

**Functions**: `getPartialCommand()`, `getCommandSuggestions()`, `completeCommand()`, `isValidCommandName()`

### Context Menus
- **FileContextMenu**: New File/Folder, Send to Chat, Copy Path, Show in Explorer, Rename, Delete
- **TabContextMenu**: Rename, Delete (agent tabs only)
- **EditorContextMenu**: Cut/Copy/Paste, Select All, Bold/Italic/Strikethrough/Code, Insert Link
- **ChatMessageContextMenu**: Copy Text, Copy Code, Re-send (user messages), Delete
- **Shared** (`src/components/shared/ContextMenu.tsx`): `MenuItem`, `MenuDivider`, `MenuHeader`, `ContextMenuContainer`, `useContextMenuPosition`, `useContextMenuClose`

### Quick Notes (`src/components/sidebar/QuickNotesSection.tsx`)
Sticky notes in sidebar. Max 200 chars per note. Persisted in appStore.

### File Search (`src/components/sidebar/FileSearch.tsx`)
Fuzzy filename + content search. `Ctrl+P`/`Ctrl+Shift+F` to focus. Excludes: node_modules, .git, dist, build, coverage, etc.

### Starred Documents (`src/components/filetree/StarredSection.tsx`)
Bookmarked files in amber with filled star. Click to open, click star to unstar.

### Workspace Onboarding (`src/components/dashboard/OnboardingWidget.tsx`)
AI-driven setup for new users. Tracks in `onboardedWorkspaces` array.

**Recommended structure**:
```
TASKS/Project1/tasks.md
00-Inbox/, 01-Active/, 02-Someday/, 03-Reference/, 04-Archive/
Templates/, README.md
```

### Styling
Tailwind with custom theme: metallic dark + cyan/violet/pink accents, custom shadows/gradients, Outfit (display) + DM Sans (body). `.input-metallic` and `.btn-primary` classes.

## API Integration

**Anthropic SDK** (`@anthropic-ai/sdk`):
- API key in Zustand (localStorage)
- Streaming + tool use enabled
- Client-side initialization: `dangerouslyAllowBrowser: true`

**Models**:
- `claude-opus-4-20250514` (most capable)
- `claude-sonnet-4-20250514` (default, balanced)
- `claude-3-5-haiku-20241022` (fastest)

## Persistent Memory System

**Files**: `src/services/memory/` (types, supabaseClient, extractionService, retrievalService), `electron/memory/ipcHandlers.ts`, `electron/memory/embeddingService.ts`

**Database** (Supabase): `memory_users`, `user_profiles`, `user_facts`, `user_preferences`, `conversation_summaries`

**Flow**: Extract facts from conversations → Store in Supabase → Retrieve on query (semantic or keyword) → Inject into system prompt (~1000 token budget)

**Embeddings**: Optional OpenAI embeddings (`text-embedding-3-small`, 1536d) for semantic search. Cost ~$0.02/1M tokens.

**Token Budget**: Profile ~400, Facts ~300, Preferences ~100, Summaries ~200 (total ~1000)

**Cross-Device**: Anonymous UUID for syncing via Supabase.

## Build Output

- `dist/` - Vite build (React app)
- `dist-electron/` - Compiled Electron TypeScript
- `release/` - Electron-builder installers

## Development Notes

- ES modules (`"type": "module"`)
- Electron: `import.meta.url` for `__dirname`
- Frameless window with custom title bar
- File ops: async through Electron IPC
- Shell: PowerShell (Windows), bash (Mac/Linux)
- Path resolution: `path-browserify`
- FileTree auto-hides dotfiles (`.git`, `.obsidian`, etc.)

## Path Aliases

`@/*` → `src/*`

## Future Enhancements

- Context management (token counting, auto-save)
- Additional MCP integrations (GitHub, Slack, Discord)
- Subagents (parallel task execution)
- Skills system (reusable workflows)
- Project-level custom instructions
- Streaming MCP tool results
- Configurable dashboard widgets
- Task creation from dashboard
- Calendar event editing via dashboard
