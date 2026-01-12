# AssistantOS

Your personal AI executive assistant with file system and shell access. Built with Electron, React, TypeScript, and Claude AI.

## Features

- Multi-agent conversations with Claude (Opus, Sonnet, Haiku)
- File system access and management
- Shell command execution
- MCP (Model Context Protocol) integrations
- Task management with Kanban board
- Persistent memory across sessions
- Real-time collaboration with multiple agents
- Custom instructions and shortcuts

## Installation

### Windows

1. Download the latest `AssistantOS-Setup-{version}.exe` from [Releases](https://github.com/mrchevyceleb/AssistantOS/releases)
2. Run the installer
3. **Windows SmartScreen Warning**: You'll see "Windows protected your PC" because the app isn't code-signed yet
   - Click **"More info"**
   - Click **"Run anyway"**
   - This is normal for unsigned apps and doesn't indicate a security issue

### Mac

1. Download the latest `AssistantOS-{version}-arm64.dmg` from [Releases](https://github.com/mrchevyceleb/AssistantOS/releases)
2. Open the DMG and drag AssistantOS to Applications
3. First launch: Right-click → Open (to bypass Gatekeeper)

### Linux

1. Download the latest `AssistantOS-{version}.AppImage` from [Releases](https://github.com/mrchevyceleb/AssistantOS/releases)
2. Make executable: `chmod +x AssistantOS-*.AppImage`
3. Run: `./AssistantOS-*.AppImage`

## Setup

1. Launch AssistantOS
2. Go to Settings (⚙️)
3. Enter your Anthropic API key ([Get one here](https://console.anthropic.com/))
4. Select a workspace folder
5. Start chatting!

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build:electron
```

See [CLAUDE.md](./CLAUDE.md) for detailed development documentation.

## Auto-Updates

AssistantOS automatically checks for updates and notifies you when a new version is available. Updates are downloaded in the background and installed on restart.

## License

MIT

## Author

Matt Johnston
