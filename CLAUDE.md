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

**IMPORTANT - Current Architecture**: The diagram above shows the CURRENT architecture (Sidebar + Tabs). Do not confuse this with the old v1.0.0 architecture described in CHANGELOG.md.

**Legacy Code (DO NOT USE)**:
- `PanelLayout.tsx` - Old 3-panel layout from v1.0.0 (not imported, not used)
- `centerPanelView` state in appStore - Orphaned from old system
- Any references to "3-panel layout" or "third column" describe deprecated code

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
- **Google**: Gmail (multi-account), `@calendar`/`@cal` (Calendar)
- **Search**: `@perplexity`/`@research`, `@brave`/`@web`, `@docs`/`@documentation`
- **Cloud**: `@vercel`/`@deploy` (Vercel)
- **Media**: `@image`/`@generate` (Gemini image generation)

**Custom Integrations**: Via chat or Settings UI. Tool: `create_mcp_integration`

**Preload API** (`window.electronAPI.mcp`): `getIntegrations()`, `configure()`, `start()`, `stop()`, `isReady()`, `getTools()`, `executeTool()`, `getStatus()`, `addGmailAccount()`, `removeGmailAccount()`, etc.

### Multi-Account Gmail Support

AssistantOS supports **6+ simultaneous Gmail accounts** with independent MCP server instances per account. Each account can be enabled/disabled independently and has unique @mention syntax.

**Architecture**:
- **Multi-Instance Pattern**: Each Gmail account runs as a separate MCP server instance (`gmail-{accountId}`)
- **Virtual Integrations**: Dynamically generated MCPIntegration objects per account in `registry.ts`
- **Token Management**: Independent OAuth tokens with automatic refresh 5 minutes before expiry
- **Connection Recovery**: Automatic reconnection with exponential backoff (3 retries: 100ms, 500ms, 2s)
- **Crash Notification**: IPC events notify UI when MCP server crashes, with "Reconnect" button

**User Features** (Settings > Integrations):
- **Add Account**: Custom labels ("Work", "Personal", etc.) with OAuth flow
- **Account Cards**: Show label, email, status (Ready/Error), tool count
- **Toggle On/Off**: Enable/disable without removing account
- **Remove Account**: Confirmation dialog before deletion
- **Unique Mentions**: `@gmail-work`, `@gmail-personal`, `@gmail-project`

**State Management** (`appStore.ts`):
```typescript
interface GmailAccount {
  id: string                     // UUID
  label: string                  // User-defined label
  email: string                  // Auto-detected from Gmail API
  enabled: boolean               // Active status
  tokens: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
  createdAt: string              // ISO timestamp
  integrationId: string          // Virtual integration ID (gmail-{id})
}
```

**Backend Implementation**:
- `electron/mcp/MCPManager.ts` - Reconnection logic, token refresh check, crash notification
- `electron/mcp/ipcHandlers.ts` - `mcp:addGmailAccount`, `mcp:removeGmailAccount`, token refresh helper
- `electron/mcp/registry.ts` - `createGmailAccountIntegration()` function
- `src/App.tsx` - Initialization on startup (configure tokens, auto-start enabled)

**UI Components** (`src/components/settings/IntegrationsModal.tsx`):
- `GmailAccountsSection` - Main container with add button and account list
- `GmailAccountCard` - Individual account display with toggle/remove
- `AddGmailAccountModal` - Label input, suggestions, OAuth trigger

**Migration**: Existing single Gmail accounts auto-migrate to multi-account structure on first launch (labeled "Primary").

### Intelligent Tool Loading System ("Plumber's Wrench")

AssistantOS now features an intelligent tool loading system that dynamically loads MCP integration tools based on conversation intent, eliminating the need for @mentions in most cases.

**How It Works**:

**Traditional (Old)**:
- User must type `@gmail check my email` to load Gmail tools
- System prompt claimed all enabled integrations were available (mismatch)
- User confused when AI can't access tools without @mention

**Intelligent (New)**:
- User types `"check my email"` - Gmail tools auto-load
- System prompt only lists currently loaded tools (synchronized)
- Tools unload after 5 idle messages to save tokens
- 70-80% token savings on average

**Architecture** (`src/services/intent/`):

**Intent Detection** (`heuristicMatcher.ts`):
- Pattern-based detection: "check email" → Gmail (0.9 confidence)
- Keyword matching: "schedule meeting" → Calendar
- Contextual analysis: conversation continuity tracking

**AI Fallback** (`aiFallback.ts`):
- Uses Claude Haiku for ambiguous cases (0.4-0.7 confidence)
- ~$0.0001 per classification
- Example: "What's tomorrow looking like?" → Calendar

**Lifecycle Manager** (`toolLoadingManager.ts`):
- State machine: UNLOADED → LOADING → ACTIVE → COOLING → UNLOADED
- Per-agent tool tracking (independent state)
- Idle detection: 5 messages without use
- Cooldown period: 30 seconds before unloading
- LRU eviction: Max 3 loaded integrations

**Token Savings**:

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Email workflow | 2,350 tokens | 2,350 tokens | 0% (same, but no @mention!) |
| Non-MCP chat | 12,350 tokens | 350 tokens | 97% |
| Average | 12,350 tokens | ~3,500 tokens | 70-80% |

**Integration Points**:
- `AgentChat.tsx` (line 1611-1650): Classic mode integration
- `AgentChatContainer.tsx` (line 428-475): Agent SDK mode integration
- `systemPrompt.ts` (line 160-183): Synchronized capability awareness

**Usage**:

No changes required for users! The system automatically detects intent:
- "check my email" → Gmail loads
- "what's on my calendar" → Calendar loads
- "search the web for X" → Brave/Perplexity loads
- @mentions still work for explicit control

### @Mention System (`src/services/mentions/parser.ts`)

Two types of mentions:
1. **Integration**: `@gmail`, `@calendar` (activates tool context)
2. **Document**: `@file.md`, `@path/to/file` (injects content)

**Functions**: `parseMessage()`, `getFileMentionSuggestions()`, `getUnifiedSuggestions()`, `extractMentionsSync()`, `stripMentions()`, `highlightMentions()`

**Autocomplete**: Shows integrations (🔌 cyan) first, then documents (📄 violet), limit 10 total. Tab/Enter to select.

### Slash Commands (`src/types/shortcut.ts`, `src/services/shortcuts/parser.ts`)

Type `/` to see shortcuts. Built-in: `/intake`, `/morning`, `/check-email`, `/check-calendar`, `/research`, `/compact`

**Functions**: `getPartialCommand()`, `getCommandSuggestions()`, `completeCommand()`, `isValidCommandName()`

### Context Token Tracking (`src/services/tokenService.ts`)

Tracks context window usage with visual indicator and auto-compaction warning.

**Settings** (Settings > Claude):
- `showContextUsage: boolean` - Toggle context indicator in chat header (default: off)

**Features**:
- **Context Indicator**: Shows "4.2K / 200K" in chat header when enabled
- **Color Coding**: Green (<50%), Amber (50-80%), Red (>80%)
- **Tooltip**: Click indicator to see breakdown (messages, system prompt, tools)
- **Auto-Compaction Warning**: Banner appears when context exceeds 80%, suggests `/compact`
- **Manual Compaction**: Use `/compact` command to summarize older messages

**Token Service Functions**:
- `estimateTokens(text)` - Simple estimation (~4 chars/token)
- `getContextUsage(messages, systemPrompt, tools, modelId)` - Calculate total usage
- `getMaxTokens(modelId)` - Return context limit (200K for all current models)
- `formatTokenCount(tokens)` - Format as "4.2K" or "1.2M"
- `getContextUsageColor(percentage)` - Get color based on usage
- `shouldCompact(percentage)` - Check if compaction recommended (>80%)

**Model Context Limits**:
| Model | Context Window |
|-------|---------------|
| Claude Opus 4 | 200K |
| Claude Sonnet 4 | 200K |
| Claude Haiku 3.5 | 200K |

### Context Menus
- **FileContextMenu**: New File/Folder, Send to Chat, Copy Path, Show in Explorer, Rename, Delete
- **TabContextMenu**: Rename, Delete (agent tabs only)
- **EditorContextMenu**: Cut/Copy/Paste, Select All, Bold/Italic/Strikethrough/Code, Insert Link
- **ChatMessageContextMenu**: Copy Text, Copy Code, Re-send (user messages), Delete
- **Shared** (`src/components/shared/ContextMenu.tsx`): `MenuItem`, `MenuDivider`, `MenuHeader`, `ContextMenuContainer`, `useContextMenuPosition`, `useContextMenuClose`

### Chat History (`src/components/sidebar/ChatHistorySection.tsx`, `src/services/chatHistory/`)

**Autosave System**:
- Conversations automatically saved to `%APPDATA%/assistantos/conversations/` as JSON files
- Debounced saving (2 second delay) to avoid excessive writes
- Triggers after each completed message (not during streaming)
- Minimum 2 messages required before saving

**Chat History Service** (`src/services/chatHistory/chatHistoryService.ts`):
- `saveConversationDebounced()` - Save with 2s debounce
- `saveConversationImmediate()` - Save immediately
- `loadConversation()` - Load by ID
- `listConversations()` - Get all saved conversations (metadata)
- `deleteConversation()` - Remove from storage
- `groupConversationsByDate()` - Organize by Today/Yesterday/Last 7 Days/etc.

**Autosave Hook** (`src/hooks/useChatAutosave.ts`):
- `useChatAutosave(messages, options)` - Hook for components
- Returns: `conversationId`, `saveNow()`, `resetConversation()`, `setConversationId()`
- Automatically tracks conversation ID per agent

**Chat History UI** (Sidebar):
- Collapsible section showing saved conversations grouped by date
- Click to load conversation into new agent tab
- Delete button to remove conversations
- Shows title, preview, timestamp, and message count
- Highlights currently active conversation

**Data Structure** (per conversation):
```typescript
{
  id: string              // Unique conversation ID
  title: string           // Auto-generated from first message
  createdAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp
  model: string           // Model used (e.g., claude-sonnet-4)
  messages: Message[]     // Full message history
  bookmarks: string[]     // Bookmarked message IDs
  workspace: string|null  // Associated workspace path
}
```

**Agent Store Extensions**:
- `createAgentWithConversation()` - Create agent with loaded history
- `findAgentByConversationId()` - Find existing agent for conversation

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

## Release Workflow

**Multi-platform GitHub Actions CI** (`.github/workflows/release.yml`):
- Triggered by pushing git tags: `git push origin v1.x.x`
- Builds for **Windows**, **Mac**, and **Linux** in parallel
- Requires `permissions: contents: write` in workflow file
- Uses `electron-builder` with `--publish always` flag

**Complete Release Process**:

1. **Bump version** in `package.json`
2. **Commit changes**: `git add -A && git commit -m "..."`
3. **Push to GitHub**: `git push origin master`
4. **Create and push tag**: `git tag v1.x.x && git push origin v1.x.x`
5. **Monitor CI**: `gh run list`, `gh run watch`, `gh run view --log`
6. **Publish release**: `gh release edit v1.x.x --draft=false --latest`

**Build Artifacts** (auto-uploaded by CI):
- Windows: `AssistantOS-Setup-{version}.exe` + `.exe.blockmap` + `latest.yml`
- Mac: `AssistantOS-{version}-arm64.dmg` + `.dmg.blockmap` + `latest-mac.yml`
- Linux: `AssistantOS-{version}.AppImage` + `latest-linux.yml`

**Important Notes**:
- Releases are created as **Draft** by default - must be published manually
- Use `gh release edit v1.x.x --draft=false --latest` to publish
- Electron-updater only detects **published** releases
- Mac icon generation happens automatically in CI (uses `sips` and `iconutil`)

**Troubleshooting**:
- If CI fails with `403 Forbidden`: Check workflow has `permissions: contents: write`
- If app doesn't detect update: Verify release is published (not draft)
- View CI logs: `gh run view --log-failed`

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

- Additional MCP integrations (GitHub, Slack, Discord)
- Subagents (parallel task execution)
- Skills system (reusable workflows)
- Project-level custom instructions
- Streaming MCP tool results
- Configurable dashboard widgets
- Task creation from dashboard
- Calendar event editing via dashboard
