# Changelog

All notable changes to AssistantOS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Task System Refactored to Supabase-Only**: Removed file-based task management entirely
  - Tasks are now stored exclusively in Supabase cloud storage
  - Removed cloud sync toggle - Supabase is always used when configured
  - Removed file task parsing from TaskPanel (fileTasks, fileProjects state removed)
  - Removed folder configuration UI (custom tasks folder, folder creation dialogs)
  - Removed migration dialog (no longer needed without file-based tasks)
  - Added clear messaging when cloud sync is not configured
  - Simplified TaskPanel from 770 lines to 262 lines (~66% reduction)
  - Real-time sync across devices via Supabase subscriptions
  - Note: `taskParser.ts` kept for potential future use but not used by TaskPanel
  - File: `src/components/tasks/TaskPanel.tsx`

### Fixed

- **Update Checker Infinite Hang**: Fixed "Check for Updates" feature hanging forever with infinite spinner
  - Root cause: `electron-updater` emits error events instead of rejecting promises, causing IPC handler to hang indefinitely
  - Added 15-second timeout to update check IPC handler to prevent infinite hangs
  - Wrapped `checkForUpdates()` in promise that resolves/rejects based on electron-updater events
  - Now properly handles: update available, no updates, errors (404, network, etc.)
  - UI shows clear error messages after timeout or failure instead of spinning forever
  - Files: `electron/main.ts` (lines 280-298), `electron/services/autoUpdater.ts` (lines 222-301)

- **Context Usage Not Resetting on Clear Chat**: Fixed context usage indicator showing incorrect token count after clearing chat
  - Context indicator now properly resets to 0 tokens when trash icon is clicked
  - Bug was caused by cached `lastSystemPrompt` and `lastTools` state not being cleared
  - Added reset of cached context values in `handleClearChat()` function
  - File: `src/components/chat/AgentChatContainer.tsx` (lines 322-323)

- **Preload Script Module Configuration**: Fixed Electron preload script failing to load with "Cannot use import statement outside a module" error
  - Changed `tsconfig.preload.json` from `"module": "ESNext"` to `"module": "CommonJS"`
  - Electron's sandboxed preload environment requires CommonJS output, not ES modules
  - This was causing all MCP integrations to disappear from the UI
  - File: `tsconfig.preload.json` (modified line 4)

### Added

#### Document Mentions (@document)
- New file search capability for workspace documents in chat
  - `fs:searchFiles` IPC handler in `electron/main.ts` for workspace file search
  - Recursive directory traversal with configurable depth (max 4 levels)
  - Result sorting: exact name matches first, then by path length
  - Excluded directories: node_modules, .git, dist, build, coverage, __pycache__, .next, .cache
  - Max 20 search results per query, case-insensitive search
- Extended mention parser (`src/services/mentions/parser.ts`):
  - New `getFileMentionSuggestions()` for workspace file autocomplete
  - Updated `parseMessage()` to extract both integration and document mentions
  - New `getUnifiedSuggestions()` for combined autocomplete (integrations + files)
  - File mention regex support for paths with slashes and extensions
  - New types: `DocumentMention`, `FileMentionSuggestion`, `UnifiedSuggestion`
- Updated chat component (`src/components/AgentChat.tsx`):
  - Unified autocomplete UI showing integrations and documents
  - Document content automatically injected into message context
  - Content wrapped in `<referenced_documents>` XML tags for Claude
  - Improved suggestion ranking: integrations first (limit 5), then documents (limit 7)
- New file system API methods exposed via `window.electronAPI.fs`:
  - `searchFiles(workspacePath, searchTerm)` - Search workspace for files matching term
  - Returns: `{ name, path, relativePath, isDirectory }[]`
- Documentation of document mention system:
  - Mention syntax: `@filename`, `@path/to/file`, `@file.ext`
  - Automatic content injection for referenced files
  - Integration with Claude agent context

#### MCP (Model Context Protocol) Integration
- New `electron/mcp/` directory containing complete MCP infrastructure
  - `registry.ts` - Central registry of 10+ MCP integrations with @mention support
  - `MCPManager.ts` - Server lifecycle management (spawn, start, stop, connect)
  - `ipcHandlers.ts` - Electron IPC handlers bridging renderer to MCP Manager
- Added MCP API to preload script (`window.electronAPI.mcp`):
  - `getIntegrations()` - List available integrations
  - `getMentionMap()` - @mention to integration ID mapping
  - `getAllMentions()` - Mentions for autocomplete
  - `configure(integrationId, config)` - Set API keys/credentials
  - `start(integrationId)` - Launch MCP server
  - `stop(integrationId)` - Stop MCP server
  - `isReady(integrationId)` - Check server status
  - `getTools(integrationIds)` - Discover available tools
  - `executeTool(integrationId, toolName, input)` - Call a tool
  - `findIntegrationForTool(toolName)` - Locate integration providing a tool
  - `getStatus()` - Query all server statuses
  - `getConfig(integrationId)` - Retrieve integration configuration
- Added 10+ pre-configured MCP integrations across 5 categories:
  - **Browser**: Playwright (local), BrowserBase (cloud)
  - **Google**: Gmail (multi-account), Google Calendar
  - **Search**: Perplexity (AI research), Brave Search (privacy)
  - **Cloud**: Vercel (deployment)
  - **Media**: Nano Banana (AI image generation)
- Added MCP server lifecycle hooks:
  - `registerMCPHandlers()` in `electron/main.ts` on app startup
  - `cleanupMCPHandlers()` on app shutdown via `before-quit` event
- Added MCP type definitions in preload script:
  - `MCPIntegration` - Integration metadata
  - `MCPMention` - Mention structure for autocomplete
  - `MCPToolDef` - Tool definition and schema
  - `MCPToolResult` - Tool execution result format
  - `MCPServerStatus` - Server health and capability status
- Added `@modelcontextprotocol/sdk` dependency (v1.25.2)
- Added MCP integration state management in `appStore.ts`:
  - `integrationConfigs` - Persisted configuration per integration
  - `setIntegrationConfig(integrationId, config)` - Update integration settings

#### Documentation
- New `docs/MCP_INTEGRATION.md` - Comprehensive MCP integration guide
  - Architecture explanation
  - File descriptions and responsibilities
  - Available integrations with setup instructions
  - User workflow (config → activation → execution)
  - Guide for adding new integrations
  - Troubleshooting section
  - Performance and security considerations
- Updated `CLAUDE.md` with:
  - New MCP Architecture section
  - MCP server lifecycle documentation
  - List of available integrations
  - Integration state management details
  - Document mention system (@document) functionality
  - File search implementation details and configuration

### Changed

#### Electron Architecture
- `electron/main.ts`:
  - Added MCP handler registration on app startup
  - Added MCP cleanup on app shutdown
  - Improved lifecycle management with dedicated handler functions
- `electron/preload.ts`:
  - Added comprehensive `mcp` API with 12 methods
  - Added full TypeScript type definitions for MCP interfaces
  - Maintained backward compatibility with existing APIs

#### Dependencies
- Updated `@modelcontextprotocol/sdk` to v1.25.2
- All other dependencies remain compatible

### Fixed

- Improved app shutdown cleanup by properly terminating MCP server processes
- Better error handling in MCP server startup with descriptive error messages

### Security

- MCP servers run in isolated child processes
- Environment variables (API keys) only visible to child process
- Tool schemas validated by MCP protocol before execution
- Input sanitization handled by Anthropic SDK

## Previous Changes

### [1.0.0] - Initial Release

- Electron-based desktop application with React UI
- Claude integration with streaming chat
- File system operations (read, write, list, create directories)
- Bash command execution
- Custom system prompt with 3-layer architecture:
  - Core identity (built-in)
  - Custom instructions (user-editable)
  - Dynamic context (runtime-gathered)
- Model selection (Opus 4, Sonnet 4, Haiku 3.5)
- Resizable 3-panel layout (FileTree, MarkdownEditor, AgentChat) **[DEPRECATED - Replaced by Sidebar + Tab system in later versions]**
- Dark mode UI with metallic theme
- Conversation history management
- Tool execution visualization
- Settings panel for API key and custom instructions

---

## Notes for Future Updates

When making changes:
1. Update this CHANGELOG with your changes before committing
2. Use "Added", "Changed", "Deprecated", "Removed", "Fixed", "Security" sections
3. Include dates in YYYY-MM-DD format for releases
4. Reference file paths and important implementation details
5. Document breaking changes prominently
6. Keep sections sorted by relevance/importance
