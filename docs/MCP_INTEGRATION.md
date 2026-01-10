# MCP (Model Context Protocol) Integration Guide

AssistantOS integrates with the Model Context Protocol (MCP) to enable Claude to access external services and tools through standardized handlers. This document explains the architecture, available integrations, and how to extend the system.

## Overview

MCP is a standardized protocol for connecting AI models with external tools and data sources. In AssistantOS, MCP integrations are:

1. **Defined in a registry** - Central source of truth for all available services
2. **Managed by a server lifecycle manager** - Spawns/stops processes, manages connections
3. **Exposed via IPC** - Available to the renderer process through Electron IPC
4. **Accessible via @mentions** - Users trigger integrations by typing `@` in chat
5. **Callable by Claude** - Agent can invoke tools from active integrations

## Architecture

### Directory Structure

```
electron/mcp/
├── registry.ts          # Integration definitions and utilities
├── MCPManager.ts        # Server lifecycle management
└── ipcHandlers.ts       # Electron IPC bridge
```

### File Descriptions

#### `registry.ts`

Single source of truth for all MCP integrations. Defines:

- **MCPIntegration interface** - Properties each integration must define
- **MCP_INTEGRATIONS array** - All available integrations with metadata
- **Utility functions**:
  - `getIntegration(id)` - Look up by ID
  - `getIntegrationByMention(mention)` - Look up by @mention
  - `getMentionMap()` - Map mentions to IDs
  - `getAllMentions()` - Get all mentions for autocomplete
  - `getIntegrationsByCategory(category)` - Filter by category
  - `getCategories()` - Get unique categories

**Integration Properties**:
```typescript
{
  id: string;                          // Unique identifier
  name: string;                        // Display name
  description: string;                 // Short description
  mention: string;                     // Primary @mention (e.g., "@gmail")
  mentionAliases?: string[];          // Alternative mentions (e.g., ["@email", "@mail"])
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media';
  command: string;                     // Executable name (usually "npx")
  args: string[];                      // Command arguments
  requiredEnvVars: Array<{
    key: string;                       // Environment variable name
    label: string;                     // Display label in UI
    type: 'apiKey' | 'oauth' | 'text'; // Configuration type
    description?: string;              // Help text
  }>;
  oauth?: {                            // OAuth configuration (optional)
    provider: 'google';
    scopes: string[];
  };
  toolPrefix: string;                  // Prefix for tool names from this service
}
```

#### `MCPManager.ts`

Manages the lifecycle of MCP server processes:

- **Server Instance Tracking** - Maintains map of running servers by integration ID
- **Environment Configuration** - Stores API keys and credentials
- **Process Management** - Spawns child processes with stdio communication
- **Client Connection** - Establishes MCP client connections via StdioClientTransport
- **Tool Discovery** - Queries servers for available tools
- **Tool Execution** - Routes tool calls to the appropriate server

**Key Methods**:
- `setEnvVars(integrationId, vars)` - Configure credentials
- `getEnvVars(integrationId)` - Retrieve configuration
- `startServer(integrationId)` - Spawn and initialize MCP server
- `stopServer(integrationId)` - Shutdown server process
- `getStatus()` - Query status of all servers
- `getTools(integrationIds)` - Discover available tools
- `executeTool(integrationId, toolName, input)` - Call a tool

#### `ipcHandlers.ts`

Electron IPC handlers that bridge the renderer to the MCP Manager:

```typescript
// Handler registration (called from electron/main.ts)
registerMCPHandlers(): void

// Cleanup (called before app quits)
cleanupMCPHandlers(): Promise<void>
```

**Exposed IPC Handlers**:
- `mcp:getIntegrations` - List available integrations
- `mcp:getMentionMap` - Get @mention mappings
- `mcp:getAllMentions` - Get all mentions for autocomplete
- `mcp:configure` - Set environment variables
- `mcp:start` - Start an integration
- `mcp:stop` - Stop an integration
- `mcp:isReady` - Check server status
- `mcp:getTools` - Discover tools
- `mcp:executeTool` - Execute a tool
- `mcp:findIntegrationForTool` - Find provider for a tool
- `mcp:getStatus` - Get all server statuses
- `mcp:getConfig` - Get integration configuration

### Type Definitions

Types are defined in `electron/preload.ts` for type-safe access:

```typescript
interface MCPIntegration {
  id: string;
  name: string;
  description: string;
  mention: string;
  mentionAliases?: string[];
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media';
  requiredEnvVars: Array<{ ... }>;
  oauth?: { provider: 'google'; scopes: string[] };
  toolPrefix: string;
}

interface MCPToolDef {
  name: string;
  description: string;
  input_schema: object;
  integrationId: string;
}

interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface MCPServerStatus {
  status: string;
  error?: string;
  toolCount?: number;
}
```

## Available Integrations

### Browser Automation

#### Playwright (`@browser`, `@playwright`)
- **Purpose**: Local browser automation for testing and web scraping
- **Setup**: No configuration required
- **Command**: `npx -y @anthropic/mcp-playwright`
- **Tools**: Browser control, page interaction, screenshot capture
- **Use Cases**: Automated testing, web scraping, accessibility testing

#### BrowserBase (`@cloud-browser`, `@browserbase`)
- **Purpose**: Cloud-based browser automation with managed infrastructure
- **Setup**: Requires API key and project ID
- **Environment Variables**:
  - `BROWSERBASE_API_KEY` - Your API key
  - `BROWSERBASE_PROJECT_ID` - Your project ID
- **Command**: `npx -y @anthropic/mcp-browserbase`
- **Tools**: Remote browser control, session management
- **Use Cases**: Long-running automation, load testing, scale testing

### Google Services

#### Gmail (`@gmail`, `@email`, `@mail`)
- **Purpose**: Multi-account email access and management
- **Setup**: OAuth authentication (Google)
- **OAuth Scope**: `https://mail.google.com/`
- **Command**: `npx -y mcp-unified-gmail`
- **Tools**: List messages, read emails, send, search, manage labels
- **Use Cases**: Email automation, notification handling, bulk operations

#### Google Calendar (`@calendar`, `@cal`, `@schedule`)
- **Purpose**: Calendar management and meeting scheduling
- **Setup**: OAuth authentication (Google)
- **OAuth Scope**: `https://www.googleapis.com/auth/calendar`
- **Command**: `npx -y mcp-google-calendar`
- **Tools**: Create events, update calendar, find free time, send invitations
- **Use Cases**: Meeting scheduling, calendar analysis, time management

### Search & Research

#### Perplexity (`@perplexity`, `@pplx`, `@research`)
- **Purpose**: AI-powered web search and research
- **Setup**: Requires API key
- **Environment Variables**:
  - `PERPLEXITY_API_KEY` - Your API key
- **Command**: `npx -y mcp-perplexity`
- **Tools**: Web search, research, question answering
- **Use Cases**: Research, fact-checking, current information lookup

#### Brave Search (`@brave`, `@search`, `@web`)
- **Purpose**: Privacy-focused web search
- **Setup**: Requires API key
- **Environment Variables**:
  - `BRAVE_API_KEY` - Your API key
- **Command**: `npx -y mcp-brave-search`
- **Tools**: Web search, news search, image search
- **Use Cases**: Web search, privacy-conscious research, news tracking

### Cloud Platforms

#### Vercel (`@vercel`, `@deploy`, `@hosting`)
- **Purpose**: Deployment and project management
- **Setup**: Requires API token
- **Environment Variables**:
  - `VERCEL_API_TOKEN` - Your API token
- **Command**: `npx -y mcp-vercel`
- **Tools**: Deploy projects, manage deployments, check status
- **Use Cases**: Deployment automation, project monitoring

### Media & Generation

#### Nano Banana (`@image`, `@img`, `@generate`, `@nanobanana`)
- **Purpose**: AI image generation with Google Gemini
- **Setup**: Requires Gemini API key
- **Environment Variables**:
  - `GEMINI_API_KEY` - Your Gemini API key
- **Command**: `npx -y mcp-nanobanana`
- **Tools**: Generate images, create variations, image editing
- **Use Cases**: Illustration, design, visualization

## User Workflow

### 1. Configuration

Users configure integrations via the Settings panel:

1. Click Settings icon in chat header
2. Select "MCP Integrations" tab
3. For each integration they want to use:
   - Expand the integration
   - Provide API keys or authorize OAuth
   - Click "Save Configuration"

### 2. Activation

Users activate integrations by mentioning them in chat:

1. Type `@` in the message input
2. See autocomplete suggestions
3. Select desired integration (e.g., `@gmail`)
4. Continue typing message
5. Send message

### 3. Tool Discovery & Execution

When Claude agent receives a message with @mentions:

1. Identifies mentioned integrations
2. Ensures servers are running
3. Queries available tools from those integrations
4. Includes tools in the next Claude API call
5. Executes tools as needed during agent loop
6. Returns results to user

### 4. Display

Tool executions from MCP integrations are displayed:

- Above the assistant response
- In expandable/collapsible format
- With tool name, input, and result
- Similar to native file/bash tools

## Adding a New Integration

To add a new MCP integration:

### 1. Define in Registry

Edit `electron/mcp/registry.ts`:

```typescript
{
  id: 'my-service',
  name: 'My Service',
  description: 'Description of what this does',
  mention: '@myservice',
  mentionAliases: ['@alias1', '@alias2'],
  category: 'cloud',  // or 'browser', 'google', 'search', 'media'
  command: 'npx',
  args: ['-y', 'mcp-my-service'],
  requiredEnvVars: [
    {
      key: 'MY_SERVICE_API_KEY',
      label: 'API Key',
      type: 'apiKey',
      description: 'Your My Service API key'
    }
  ],
  // Optional: For OAuth integrations
  oauth: {
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/...']
  },
  toolPrefix: 'myservice_'
}
```

### 2. Test Integration

The MCP server must:

- Be available via `npx -y mcp-my-service` (or your command)
- Implement the MCP protocol
- Expose tools with proper schemas
- Handle stdin/stdout communication

### 3. Verify Autocomplete

The registry utilities automatically generate:
- Mention map for auto-detection
- Autocomplete suggestions
- Category filtering

No additional code needed for UI integration.

## Configuration Persistence

MCP integration configurations are stored in Zustand state:

**State Structure** (`src/stores/appStore.ts`):
```typescript
integrationConfigs: Record<string, IntegrationConfig>

interface IntegrationConfig {
  enabled: boolean
  envVars: Record<string, string>
  oauthTokens?: {
    accessToken: string
    refreshToken: string
    expiresAt?: number
  }
}
```

- Persisted to localStorage via Zustand persistence middleware
- Key: `assistantos-storage`
- Automatically loaded on app startup

## Troubleshooting

### Server Won't Start

**Symptoms**: "Error starting MCP server" in UI

**Checks**:
1. Verify `npx` is installed globally: `which npx` (Mac/Linux) or `where npx` (Windows)
2. Verify npm package is published: `npm search mcp-servicename`
3. Check environment variables are set correctly
4. Check server logs in browser console (F12)

### Tools Not Discovered

**Symptoms**: Integration starts but no tools appear

**Checks**:
1. Verify MCP server is actually running: check `getStatus()`
2. Confirm server implements MCP protocol correctly
3. Check `toolCount` in status - should be > 0
4. Review server stderr output in console

### Authentication Fails

**Symptoms**: OAuth flow completes but tools still unavailable

**Checks**:
1. Verify scopes match service requirements
2. Check token hasn't expired
3. Confirm credentials stored in `integrationConfigs`
4. Try removing and re-adding integration

### Tool Execution Errors

**Symptoms**: Tool calls fail with "unknown tool" or similar

**Checks**:
1. Verify tool name matches discovered tools exactly
2. Confirm tool input matches schema
3. Check MCP server logs
4. Verify service API key is still valid

## Performance Considerations

### Memory Usage

Each running MCP server:
- Spawns a child process
- Consumes RAM (typically 50-200MB per server)
- Only started when needed
- Should be stopped when not in use

### Network Latency

Tool execution adds network round-trip time:
- Local tools (Playwright): ~100ms
- Remote tools (Gmail, Vercel): ~500-2000ms
- Consider for time-sensitive operations

### Rate Limiting

Some integrations have rate limits:
- Gmail: 500 quota units per second
- Calendar: Variable per operation
- Check service documentation
- Implement backoff in agent loop if needed

## Security Notes

### Credential Storage

- API keys stored in localStorage (via Zustand)
- Consider implementing secure storage for production
- Environment variables set in child process only
- Never logged or transmitted

### Process Isolation

- MCP servers run as separate child processes
- Communicate via stdin/stdout (stdio)
- Cannot access renderer process memory
- Limited to configured permissions

### Input Validation

- Tool schemas validated by MCP protocol
- Claude agent respects tool definitions
- Input sanitized before execution
- Output truncated to prevent token overflow

## Future Extensions

Planned enhancements:
- GitHub integration (code operations, PR management)
- Slack/Discord (messaging, notifications)
- Database tools (query, analyze, transform)
- File storage (S3, Drive, OneDrive)
- Streaming results for long-running operations
- Tool chaining and pipelines
- Custom tool creation UI
