# MCP API Reference

Complete API documentation for the MCP integration system in AssistantOS.

## Table of Contents

- [Renderer Process API](#renderer-process-api)
- [Type Definitions](#type-definitions)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Renderer Process API

All MCP methods are available via `window.electronAPI.mcp` in React components and scripts.

### `getIntegrations()`

Returns all available MCP integrations from the registry.

**Signature**:
```typescript
getIntegrations(): Promise<MCPIntegration[]>
```

**Returns**:
```typescript
Array<{
  id: string;
  name: string;
  description: string;
  mention: string;
  mentionAliases?: string[];
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media';
  requiredEnvVars: Array<{ key: string; label: string; type: string; }>;
  oauth?: { provider: 'google'; scopes: string[]; };
  toolPrefix: string;
}>
```

**Example**:
```typescript
const integrations = await window.electronAPI.mcp.getIntegrations();
integrations.forEach(int => {
  console.log(`${int.name}: ${int.mention}`);
});
```

---

### `getMentionMap()`

Returns mapping of @mentions to integration IDs for quick lookup.

**Signature**:
```typescript
getMentionMap(): Promise<Record<string, string>>
```

**Returns**:
```typescript
{
  '@browser': 'playwright',
  '@playwright': 'playwright',
  '@cloud-browser': 'browserbase',
  '@browserbase': 'browserbase',
  '@gmail': 'gmail',
  '@email': 'gmail',
  '@mail': 'gmail',
  // ... etc
}
```

**Example**:
```typescript
const mentionMap = await window.electronAPI.mcp.getMentionMap();
const integrationId = mentionMap['@gmail']; // 'gmail'
```

---

### `getAllMentions()`

Returns all mentions (primary + aliases) for autocomplete suggestions.

**Signature**:
```typescript
getAllMentions(): Promise<MCPMention[]>
```

**Returns**:
```typescript
Array<{
  mention: string;
  integrationId: string;
  name: string;
  description: string;
  isPrimary: boolean;
}>
```

**Example**:
```typescript
const mentions = await window.electronAPI.mcp.getAllMentions();
const gmailMentions = mentions.filter(m => m.integrationId === 'gmail');
// [
//   { mention: '@gmail', integrationId: 'gmail', name: 'Gmail', ..., isPrimary: true },
//   { mention: '@email', integrationId: 'gmail', name: 'Gmail', ..., isPrimary: false },
//   { mention: '@mail', integrationId: 'gmail', name: 'Gmail', ..., isPrimary: false }
// ]
```

---

### `configure(integrationId, config)`

Configure environment variables and credentials for an integration.

**Signature**:
```typescript
configure(
  integrationId: string,
  config: Record<string, string>
): Promise<{ success: boolean; error?: string }>
```

**Parameters**:
- `integrationId` (string) - Integration ID (e.g., 'gmail', 'perplexity')
- `config` (object) - Environment variables to set

**Returns**:
- `success` (boolean) - Whether configuration was saved
- `error` (string, optional) - Error message if failed

**Example**:
```typescript
// Configure Perplexity with API key
const result = await window.electronAPI.mcp.configure('perplexity', {
  'PERPLEXITY_API_KEY': 'pplx-xxxxxxxxxxxxxxx'
});

if (result.success) {
  console.log('Configured successfully');
} else {
  console.error('Configuration failed:', result.error);
}
```

---

### `start(integrationId)`

Start an MCP server for the given integration.

**Signature**:
```typescript
start(integrationId: string): Promise<{ success: boolean; error?: string }>
```

**Parameters**:
- `integrationId` (string) - Integration ID to start

**Returns**:
- `success` (boolean) - Whether server started successfully
- `error` (string, optional) - Error message if failed

**Error Cases**:
- Unknown integration ID
- Missing required configuration
- Server process failed to start
- MCP protocol negotiation failed

**Example**:
```typescript
// Ensure Gmail integration is running
const result = await window.electronAPI.mcp.start('gmail');

if (result.success) {
  console.log('Gmail MCP server started');
} else {
  console.error('Failed to start:', result.error);
}
```

---

### `stop(integrationId)`

Stop an MCP server for the given integration.

**Signature**:
```typescript
stop(integrationId: string): Promise<{ success: boolean; error?: string }>
```

**Parameters**:
- `integrationId` (string) - Integration ID to stop

**Returns**:
- `success` (boolean) - Whether server stopped successfully
- `error` (string, optional) - Error message if failed

**Example**:
```typescript
// Clean up resources
await window.electronAPI.mcp.stop('gmail');
```

---

### `isReady(integrationId)`

Check if an MCP server is running and ready to accept commands.

**Signature**:
```typescript
isReady(integrationId: string): Promise<boolean>
```

**Parameters**:
- `integrationId` (string) - Integration ID to check

**Returns**:
- `true` if server is running and ready
- `false` otherwise

**Example**:
```typescript
// Check before executing tools
if (await window.electronAPI.mcp.isReady('gmail')) {
  // Safe to execute gmail tools
}
```

---

### `getTools(integrationIds)`

Discover available tools from one or more integrations.

**Signature**:
```typescript
getTools(integrationIds: string[]): Promise<MCPToolDef[]>
```

**Parameters**:
- `integrationIds` (string[]) - Array of integration IDs

**Returns**:
```typescript
Array<{
  name: string;
  description: string;
  input_schema: object;
  integrationId: string;
}>
```

**Example**:
```typescript
// Get all tools available from Gmail
const tools = await window.electronAPI.mcp.getTools(['gmail']);

tools.forEach(tool => {
  console.log(`${tool.name}: ${tool.description}`);
  console.log(`Schema:`, tool.input_schema);
});
```

---

### `executeTool(integrationId, toolName, input)`

Execute a tool from an integration.

**Signature**:
```typescript
executeTool(
  integrationId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<MCPToolResult>
```

**Parameters**:
- `integrationId` (string) - Which integration provides the tool
- `toolName` (string) - Name of the tool to execute
- `input` (object) - Tool input parameters matching the schema

**Returns**:
```typescript
{
  success: boolean;
  result?: unknown;
  error?: string;
}
```

**Example**:
```typescript
// Send an email via Gmail
const result = await window.electronAPI.mcp.executeTool(
  'gmail',
  'send_message',
  {
    to: 'recipient@example.com',
    subject: 'Hello',
    body: 'This is a test message'
  }
);

if (result.success) {
  console.log('Email sent:', result.result);
} else {
  console.error('Failed to send email:', result.error);
}
```

---

### `findIntegrationForTool(toolName)`

Find which integration provides a given tool.

**Signature**:
```typescript
findIntegrationForTool(toolName: string): Promise<string | undefined>
```

**Parameters**:
- `toolName` (string) - Name of the tool to find

**Returns**:
- Integration ID (string) if found
- `undefined` if no integration provides this tool

**Example**:
```typescript
// Find which integration has send_message tool
const integrationId = await window.electronAPI.mcp.findIntegrationForTool('send_message');

if (integrationId) {
  console.log(`Tool provided by: ${integrationId}`);
} else {
  console.log('Tool not found in any integration');
}
```

---

### `getStatus()`

Get the current status of all MCP servers.

**Signature**:
```typescript
getStatus(): Promise<Record<string, MCPServerStatus>>
```

**Returns**:
```typescript
{
  'gmail': {
    status: 'ready',
    error?: undefined,
    toolCount?: 15
  },
  'perplexity': {
    status: 'error',
    error: 'Missing required configuration: PERPLEXITY_API_KEY',
    toolCount?: 0
  },
  'playwright': {
    status: 'stopped',
    error?: undefined,
    toolCount?: 0
  }
}
```

**Status Values**:
- `'starting'` - Server process spawned, connecting
- `'ready'` - Connected and ready for tool calls
- `'error'` - Failed to start or negotiate
- `'stopped'` - Server not running

**Example**:
```typescript
const status = await window.electronAPI.mcp.getStatus();

Object.entries(status).forEach(([integrationId, info]) => {
  console.log(`${integrationId}: ${info.status}`);
  if (info.error) {
    console.error(`  Error: ${info.error}`);
  }
  if (info.toolCount) {
    console.log(`  Tools available: ${info.toolCount}`);
  }
});
```

---

### `getConfig(integrationId)`

Retrieve the current configuration for an integration.

**Signature**:
```typescript
getConfig(integrationId: string): Promise<Record<string, string>>
```

**Parameters**:
- `integrationId` (string) - Integration to get config for

**Returns**:
```typescript
{
  'API_KEY': 'value',
  'PROJECT_ID': 'value',
  // ... other configured environment variables
}
```

**Example**:
```typescript
// Check if Gmail is configured
const config = await window.electronAPI.mcp.getConfig('gmail');

if (Object.keys(config).length === 0) {
  console.log('Gmail not configured');
} else {
  console.log('Gmail is configured');
  console.log('Config keys:', Object.keys(config));
}
```

---

## Type Definitions

### MCPIntegration

```typescript
interface MCPIntegration {
  id: string;
  name: string;
  description: string;
  mention: string;
  mentionAliases?: string[];
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media';
  requiredEnvVars: Array<{
    key: string;
    label: string;
    type: 'apiKey' | 'oauth' | 'text';
    description?: string;
  }>;
  oauth?: {
    provider: 'google';
    scopes: string[];
  };
  toolPrefix: string;
}
```

### MCPMention

```typescript
interface MCPMention {
  mention: string;
  integrationId: string;
  name: string;
  description: string;
  isPrimary: boolean;
}
```

### MCPToolDef

```typescript
interface MCPToolDef {
  name: string;
  description: string;
  input_schema: object;
  integrationId: string;
}
```

### MCPToolResult

```typescript
interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}
```

### MCPServerStatus

```typescript
interface MCPServerStatus {
  status: string;
  error?: string;
  toolCount?: number;
}
```

---

## Error Handling

### Common Error Patterns

**Configuration Missing**:
```typescript
try {
  await window.electronAPI.mcp.start('perplexity');
} catch (error) {
  // "Missing required configuration: PERPLEXITY_API_KEY"
}
```

**Tool Not Found**:
```typescript
const result = await window.electronAPI.mcp.executeTool(
  'gmail',
  'nonexistent_tool',
  {}
);

if (!result.success) {
  console.error(result.error); // "Tool not found: nonexistent_tool"
}
```

**Integration Not Running**:
```typescript
const ready = await window.electronAPI.mcp.isReady('gmail');
if (!ready) {
  // Start it first
  await window.electronAPI.mcp.start('gmail');
}
```

### Best Practices

1. **Always check status before executing**:
```typescript
if (!await window.electronAPI.mcp.isReady(integrationId)) {
  await window.electronAPI.mcp.start(integrationId);
}
```

2. **Handle tool execution failures gracefully**:
```typescript
const result = await window.electronAPI.mcp.executeTool(...);
if (!result.success) {
  // Show user-friendly error
  console.error('Tool failed:', result.error);
  // Retry or offer alternatives
}
```

3. **Cache discovery results**:
```typescript
// Don't call getTools() repeatedly
const tools = await window.electronAPI.mcp.getTools(integrationIds);
// Reuse 'tools' instead of calling again
```

---

## Examples

### Complete Integration Flow

```typescript
async function executeGmailTool(toolName: string, input: any) {
  try {
    // 1. Check if configured
    const config = await window.electronAPI.mcp.getConfig('gmail');
    if (Object.keys(config).length === 0) {
      return { error: 'Gmail not configured' };
    }

    // 2. Ensure server is running
    if (!await window.electronAPI.mcp.isReady('gmail')) {
      const startResult = await window.electronAPI.mcp.start('gmail');
      if (!startResult.success) {
        return { error: `Failed to start Gmail: ${startResult.error}` };
      }
    }

    // 3. Execute tool
    const result = await window.electronAPI.mcp.executeTool(
      'gmail',
      toolName,
      input
    );

    if (!result.success) {
      return { error: `Tool failed: ${result.error}` };
    }

    return { success: true, data: result.result };

  } catch (error) {
    return { error: `Exception: ${error.message}` };
  }
}

// Usage
const result = await executeGmailTool('send_message', {
  to: 'user@example.com',
  subject: 'Test',
  body: 'Message'
});

if (result.error) {
  console.error(result.error);
} else {
  console.log('Success:', result.data);
}
```

### React Component Example

```typescript
import { useEffect, useState } from 'react';

export function MaintegrationsPanel() {
  const [integrations, setIntegrations] = useState([]);
  const [status, setStatus] = useState({});

  useEffect(() => {
    loadData();
    // Refresh status every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const [ints, stat] = await Promise.all([
      window.electronAPI.mcp.getIntegrations(),
      window.electronAPI.mcp.getStatus()
    ]);
    setIntegrations(ints);
    setStatus(stat);
  }

  async function handleStart(integrationId) {
    const result = await window.electronAPI.mcp.start(integrationId);
    if (!result.success) {
      alert(`Failed: ${result.error}`);
    }
    loadData();
  }

  return (
    <div className="integrations-panel">
      {integrations.map(int => (
        <div key={int.id} className="integration-card">
          <h3>{int.name}</h3>
          <p>{int.description}</p>
          <p>Status: {status[int.id]?.status || 'unknown'}</p>
          <button onClick={() => handleStart(int.id)}>
            Start
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## Performance Notes

- `getIntegrations()` - Cached by registry, very fast
- `getAllMentions()` - Derived from registry, instant
- `start()` - Spawns process (100-500ms), first call slower
- `getTools()` - Queries running server (200-1000ms)
- `executeTool()` - Depends on service latency (100ms-5000ms)

For best performance:
- Cache integration list
- Reuse getTools() results
- Keep servers running for frequently used integrations
- Batch tool calls when possible

---

**Last Updated**: January 2026
