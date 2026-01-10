# MCP Quick Reference

Quick lookup for MCP integration commands and mentions.

## @Mention Cheat Sheet

| Mention | Integration | Category | Purpose |
|---------|-------------|----------|---------|
| `@browser` / `@playwright` | Playwright | Browser | Local browser automation & testing |
| `@cloud-browser` / `@browserbase` | BrowserBase | Browser | Cloud browser automation |
| `@gmail` / `@email` / `@mail` | Gmail | Google | Multi-account email access |
| `@calendar` / `@cal` / `@schedule` | Google Calendar | Google | Calendar & meeting management |
| `@perplexity` / `@pplx` / `@research` | Perplexity | Search | AI-powered web research |
| `@brave` / `@search` / `@web` | Brave Search | Search | Privacy-focused web search |
| `@vercel` / `@deploy` / `@hosting` | Vercel | Cloud | Deployment & project management |
| `@image` / `@img` / `@generate` / `@nanobanana` | Nano Banana | Media | AI image generation |

## Setup Guide

### No Configuration Required
- `@browser` - Just mention and use

### API Key Required
```
1. Settings → MCP Integrations
2. Click on integration
3. Enter API key
4. Click Save
```

Integrations requiring keys:
- `@cloud-browser` - BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID
- `@perplexity` - PERPLEXITY_API_KEY
- `@brave` - BRAVE_API_KEY
- `@vercel` - VERCEL_API_TOKEN
- `@image` - GEMINI_API_KEY

### OAuth Required
```
1. Settings → MCP Integrations
2. Click OAuth button
3. Complete Google auth flow
4. Return to app
```

Integrations with OAuth:
- `@gmail` - Google OAuth
- `@calendar` - Google OAuth

## Common Workflows

### Email Management
```
"@gmail find all unread emails from boss@example.com from the last week"
"@mail send an email to client@example.com with subject 'Project Update'"
```

### Scheduling
```
"@calendar find my next 5 available 1-hour slots next week"
"@schedule create a meeting with john@example.com next Tuesday at 2pm"
```

### Browser Automation
```
"@browser navigate to example.com and take a screenshot"
"@cloud-browser test the checkout flow on our site"
```

### Research
```
"@research what are the latest developments in AI?"
"@pplx find the top 5 AI news stories from today"
```

### Web Search
```
"@brave search for best practices in TypeScript"
"@web find pricing information for Vercel"
```

### Deployment
```
"@vercel deploy my latest changes"
"@deploy what's the status of my last deployment?"
```

### Image Generation
```
"@image generate a professional headshot for my profile"
"@generate create a logo for my startup"
```

## Troubleshooting Checklist

**Server won't start?**
- [ ] Do you have the integration configured? (Settings → MCP)
- [ ] For API key integrations, is the key entered?
- [ ] Is npm/npx installed? (`npx --version`)
- [ ] Try refreshing the app

**Tools not appearing?**
- [ ] Check that server status shows "ready" in Settings
- [ ] Try stopping and restarting the integration
- [ ] Check browser console for errors (F12)

**OAuth loop / Infinite redirect?**
- [ ] Try removing integration config and re-adding
- [ ] Ensure scopes match integration requirements
- [ ] Check that browser cookies aren't blocking OAuth

**Tool call fails?**
- [ ] Verify API key/credentials are still valid
- [ ] Check rate limits (Gmail: 500 QPS, etc.)
- [ ] Review tool input format matches schema
- [ ] Try a simpler version of the request first

## File Locations

**Configuration**:
- `electron/mcp/registry.ts` - Integration definitions
- `src/stores/appStore.ts` - User settings (persisted)

**Implementation**:
- `electron/mcp/MCPManager.ts` - Server lifecycle
- `electron/mcp/ipcHandlers.ts` - IPC bridge

**Documentation**:
- `docs/MCP_INTEGRATION.md` - Full guide
- `docs/MCP_QUICK_REFERENCE.md` - This file
- `CLAUDE.md` - Architecture overview

## API Examples

### From React Component

```typescript
// Get all available integrations
const integrations = await window.electronAPI.mcp.getIntegrations();

// Configure integration
await window.electronAPI.mcp.configure('gmail', {
  'GMAIL_OAUTH_TOKEN': 'ya29...'
});

// Start integration
await window.electronAPI.mcp.start('gmail');

// Get available tools
const tools = await window.electronAPI.mcp.getTools(['gmail']);

// Execute a tool
const result = await window.electronAPI.mcp.executeTool(
  'gmail',
  'send_message',
  {
    to: 'user@example.com',
    subject: 'Hello',
    body: 'Test message'
  }
);

// Check status
const status = await window.electronAPI.mcp.getStatus();
console.log(status['gmail']); // { status: 'ready', toolCount: 15 }
```

### Tool Execution Pattern

```typescript
// 1. Check if integration is ready
const ready = await window.electronAPI.mcp.isReady('vercel');

// 2. If not ready, start it
if (!ready) {
  const config = await window.electronAPI.mcp.getConfig('vercel');
  if (!config['VERCEL_API_TOKEN']) {
    // Need configuration first
    return;
  }
  await window.electronAPI.mcp.start('vercel');
}

// 3. Get tools and their schemas
const tools = await window.electronAPI.mcp.getTools(['vercel']);

// 4. Execute tool
const result = await window.electronAPI.mcp.executeTool(
  'vercel',
  'deploy_project',
  { projectId: 'my-project' }
);

// 5. Handle result
if (result.success) {
  console.log('Deployed:', result.result);
} else {
  console.error('Deploy failed:', result.error);
}
```

## Environment Variables Reference

### Gmail
- No environment variables (uses OAuth)

### Google Calendar
- No environment variables (uses OAuth)

### Perplexity
- `PERPLEXITY_API_KEY` - Your Perplexity API key

### Brave Search
- `BRAVE_API_KEY` - Your Brave Search API key

### BrowserBase
- `BROWSERBASE_API_KEY` - Your API key
- `BROWSERBASE_PROJECT_ID` - Your project ID

### Vercel
- `VERCEL_API_TOKEN` - Your API token

### Nano Banana (Image Generation)
- `GEMINI_API_KEY` - Your Google Gemini API key

### Playwright
- No configuration required (local only)

## Performance Tips

**Use single integration per message**
- Mentioning one integration is faster than multiple
- Claude will only load needed tools

**Prefer local tools when possible**
- `@browser` (Playwright) is faster than `@cloud-browser`
- Native tools (file/bash) are fastest overall

**Stop unused integrations**
- Save memory by stopping integrations you're not using
- Settings → MCP Integrations → Stop button

**Batch operations**
- If doing multiple emails, do them in one agent call
- Reduces round-trip latency

## Security Best Practices

**Protect your API keys**
- Don't share screenshots showing keys
- Never commit keys to git (even in env files)
- Use dedicated service accounts where possible

**Review permissions**
- Only enable OAuth scopes you actually need
- Gmail can read all your emails - consider a service account
- Regularly audit integration access in Google/Vercel accounts

**Credential rotation**
- Rotate API keys periodically (yearly minimum)
- Immediately rotate if key is exposed

## Getting Help

**Check integration status**:
```
Settings → MCP Integrations → Click integration
Look for "Status: ready" or error message
```

**Enable debug mode**:
```
Press F12 to open developer tools
Check Console tab for error messages
```

**Review full documentation**:
```
See docs/MCP_INTEGRATION.md for complete details
```

**File an issue**:
```
Include:
- Which integration failed
- What command you ran
- Full error message from console
- Your OS and AssistantOS version
```
