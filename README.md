# AssistantOS

Your personal AI executive assistant in a desktop application. AssistantOS gives Claude direct access to your file system, shell commands, and external services via MCP (Model Context Protocol) integrations.

## Features

### Core Capabilities
- **Claude AI Integration** - Full Claude Opus/Sonnet/Haiku support with streaming responses
- **File Management** - Read, write, create, and navigate files with a native file tree
- **Shell Access** - Execute bash/PowerShell commands directly from the AI assistant
- **Markdown Editor** - Built-in WYSIWYG editor for viewing and editing files
- **Conversation History** - Persistent chat with full context preservation
- **Custom Instructions** - Personalize Claude's behavior with user preferences
- **3-Layer System Prompt** - Core identity + custom instructions + dynamic context

### @Mention System
Reference workspace documents and external services in your messages:

**Document Mentions** - Reference files and folders from your workspace
```
@README.md  @src/config.ts  @docs/architecture.md
```
Document content is automatically included in Claude's context for analysis.

**Integration Mentions** - Access external services and tools
| Service | Mention | Purpose |
|---------|---------|---------|
| **Playwright** | `@browser` | Local browser automation & testing |
| **BrowserBase** | `@cloud-browser` | Cloud browser automation |
| **Gmail** | `@gmail` | Multi-account email access |
| **Google Calendar** | `@calendar` | Calendar & meeting management |
| **Perplexity** | `@research` | AI-powered web research |
| **Brave Search** | `@web` | Privacy-focused web search |
| **Vercel** | `@deploy` | Deployment & project management |
| **Nano Banana** | `@image` | AI image generation |

[Full MCP documentation](docs/MCP_QUICK_REFERENCE.md)

### UI/UX
- **Resizable 3-Panel Layout** - FileTree, MarkdownEditor, and AgentChat
- **Dark Mode Only** - Optimized for extended use
- **Frameless Window** - Clean, modern interface with custom title bar
- **Responsive Design** - Works on desktop (tested at 1280px) and smaller screens

## Quick Start

### Requirements
- Node.js 18+
- npm 9+
- Valid Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/AssistantOS.git
cd AssistantOS
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

This will launch both the Vite dev server (port 5173) and Electron.

### First Use

1. Open AssistantOS
2. Click the **Settings** icon in the chat panel
3. Paste your Anthropic API key and save
4. Start chatting with Claude!

## Usage Examples

### File Operations
```
"Read the package.json file and tell me the dependencies"
"Create a new file called notes.md with today's todo list"
"List all files in the current directory"
```

### Document References (with @mentions)
```
"Summarize @README.md for me"
"Compare @src/config.ts with @src/constants.ts"
"@docs/architecture.md explain this system design"
"Review the changes in @package.json"
```

### Code Assistance
```
"Help me debug this TypeScript error"
"Refactor this function to be more efficient"
"Write unit tests for this component"
```

### Research with @mentions
```
"@research what are the latest developments in AI?"
"@web find best practices for React performance"
```

### Email Management
```
"@gmail find all unread emails from my boss"
"@mail send a summary to the team"
```

### Image Generation
```
"@image create a professional logo for my project"
```

## Development

### Available Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Build Electron installer
npm run build:electron

# Run only Vite dev server
npm run dev:vite

# Run only Electron
npm run dev:electron

# Preview production build
npm run preview
```

### Project Structure

```
AssistantOS/
├── electron/              # Electron main/preload processes
│   ├── main.ts           # Main process entry
│   ├── preload.ts        # Context bridge & type definitions
│   └── mcp/              # MCP integration system
│       ├── registry.ts   # Integration definitions
│       ├── MCPManager.ts # Server lifecycle
│       └── ipcHandlers.ts # IPC bridge
├── src/
│   ├── components/       # React components
│   ├── services/         # Business logic (Claude, tools, prompts)
│   ├── stores/           # Zustand state management
│   └── App.tsx           # Root component
├── docs/                 # Documentation
│   ├── MCP_INTEGRATION.md # Full MCP guide
│   └── MCP_QUICK_REFERENCE.md # Quick lookup
├── CLAUDE.md             # AI assistant context
├── CHANGELOG.md          # Version history
└── README.md             # This file
```

### Key Technologies

- **Frontend**: React 19, Vite, Tailwind CSS
- **Desktop**: Electron 39
- **AI**: Anthropic SDK v0.71.2
- **State**: Zustand 5.0.9
- **MCP**: @modelcontextprotocol/sdk v1.25.2
- **Editor**: Milkdown (markdown)
- **UI Components**: Lucide React icons

### Architecture

#### Electron
- **Main Process** (`electron/main.ts`):
  - Manages window lifecycle
  - Handles IPC for file operations, shell execution, and MCP
  - Registers MCP handlers on startup
  - Cleans up MCP servers on shutdown

- **Preload Script** (`electron/preload.ts`):
  - Exposes safe APIs via `window.electronAPI`
  - Includes file system, bash, shell, and MCP APIs
  - Type-safe bridge between renderer and main

#### React Application
- **State Management**: Zustand with localStorage persistence
- **Services**:
  - `claude.ts` - Streaming chat with Claude SDK
  - `systemPrompt.ts` - 3-layer prompt assembly
  - `tools/` - File/bash tool handlers
  - `contextService.ts` - Dynamic context gathering
- **Components**:
  - `TitleBar.tsx` - Custom window controls
  - `FileTree.tsx` - File system navigation
  - `MarkdownEditor.tsx` - WYSIWYG markdown editor
  - `AgentChat.tsx` - Chat interface with Claude

#### MCP Integration
- **Registry** (`registry.ts`): Central definition of all integrations
- **Manager** (`MCPManager.ts`): Spawns/manages MCP server processes
- **Handlers** (`ipcHandlers.ts`): Electron IPC bridge
- **State**: Persisted configuration in app store

See [CLAUDE.md](CLAUDE.md) for full architecture documentation.

## Configuration

### Environment Variables

Not required for basic operation. Only needed for specific MCP integrations:

```bash
# Perplexity
PERPLEXITY_API_KEY=your_key_here

# Brave Search
BRAVE_API_KEY=your_key_here

# BrowserBase
BROWSERBASE_API_KEY=your_key_here
BROWSERBASE_PROJECT_ID=your_project_id

# Vercel
VERCEL_API_TOKEN=your_token_here

# Gemini (for image generation)
GEMINI_API_KEY=your_key_here
```

OAuth-based integrations (Gmail, Google Calendar) use in-app configuration.

### Custom Instructions

Edit custom instructions in Settings to personalize Claude's behavior:

- Communication style preferences
- Coding style guidelines
- How the assistant should approach problems
- Domain-specific instructions

Instructions are saved to localStorage and included in every Claude API call.

## MCP Integration Setup

### No Configuration
- **Playwright** (`@browser`) - Works out of the box

### API Key Required
1. Open Settings → MCP Integrations
2. Scroll to the integration
3. Enter API key
4. Click Save

Integrations requiring keys:
- Perplexity (`@research`)
- Brave Search (`@web`)
- BrowserBase (`@cloud-browser`)
- Vercel (`@deploy`)
- Nano Banana (`@image`)

### OAuth Required
1. Open Settings → MCP Integrations
2. Click "Connect" button
3. Complete OAuth flow in browser
4. Grant required permissions

Integrations with OAuth:
- Gmail (`@gmail`)
- Google Calendar (`@calendar`)

See [MCP Quick Reference](docs/MCP_QUICK_REFERENCE.md) for detailed setup.

## Building

### Development Build
```bash
npm run build
```
Compiles TypeScript and bundles React app to `dist/`.

### Production Build (Installers)
```bash
npm run build:electron
```
Creates platform-specific installers in `release/`:
- Windows: NSIS installer (.exe)
- macOS: DMG installer (.dmg)
- Linux: AppImage

## Troubleshooting

### App won't start
- Check Node.js version: `node --version` (need 18+)
- Clear cache: `rm -rf node_modules package-lock.json && npm install`
- Check Vite port: `npx kill-port 5173`

### Claude API errors
- Verify API key in Settings
- Check API key is valid at console.anthropic.com
- Confirm you have API quota remaining
- Check internet connection

### MCP integration won't work
- Verify configuration in Settings → MCP Integrations
- Check server status shows "ready"
- For API key integrations, ensure key is entered
- For OAuth, re-authorize if token expired
- See [MCP troubleshooting guide](docs/MCP_INTEGRATION.md#troubleshooting)

### File operations failing
- Ensure workspace path is set (select folder from sidebar)
- Check file/directory permissions
- Verify path is not in a restricted system directory

## Performance Tips

1. **Use native tools first** - File and bash tools are fastest
2. **Keep file size reasonable** - Large files slow down context
3. **Mention one MCP at a time** - Reduces tool discovery overhead
4. **Stop unused MCPs** - Free memory by stopping integrations you're not using
5. **Use Haiku for quick tasks** - Faster/cheaper than Opus

## Security

### API Keys
- Stored in browser localStorage (encrypted at rest by browser)
- Never logged or sent anywhere except to Anthropic servers
- Rotate keys periodically for security

### File Access
- Only accesses files in the selected workspace
- No system file access (requires user selection)
- All file operations shown to user

### Shell Commands
- Execute arbitrary commands only with user approval
- Use with caution - can modify system state
- Shell has access to your environment variables

### MCP Servers
- Run as isolated child processes
- Communicate via stdin/stdout (no network access)
- Credentials not visible to other processes
- Cleaned up on app shutdown

## Contributing

Contributions welcome! Areas of interest:
- New MCP integrations
- UI/UX improvements
- Performance optimization
- Bug fixes
- Documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) (if exists) or open an issue.

## License

MIT License - See LICENSE file for details

## Roadmap

### Planned Features
- Conversation persistence (save/load chats)
- Context compaction for long conversations
- Additional MCP integrations (GitHub, Slack, Discord)
- Subagents (parallel task execution)
- Skills system (reusable workflows)
- Project-level custom instructions

### Community Integrations
Custom MCP integrations welcome! See [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md#adding-a-new-integration) for how to add one.

## Support

- **Documentation**: See [CLAUDE.md](CLAUDE.md) and [docs/](docs/) folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## Credits

Built with:
- [Claude API](https://anthropic.com) - AI backbone
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://react.dev/) - UI framework
- [Model Context Protocol](https://modelcontextprotocol.io/) - External integrations
- [Anthropic MCP Servers](https://github.com/anthropics/mcp-servers) - Reference implementations

---

**Last Updated**: January 2026
**Current Version**: 1.0.0 (with MCP support)
