<script lang="ts">
  import { settings, updateSetting } from '$lib/stores/settings';
  import type { AppSettings, MCPServerConfig } from '$lib/stores/settings';
  import { mcpListTools, stdioMcpSpawn, stdioMcpListTools, stdioMcpStop, stdioMcpStatus } from '$lib/utils/tauri';

  let transportTab = $state<'stdio' | 'http'>('stdio');
  let newMcpName = $state('');
  let newMcpUrl = $state('');
  let newMcpToken = $state('');
  let newMcpHeaders = $state('{}');
  let newMcpTimeoutMs = $state(20000);
  let newMcpCommand = $state('');
  let newMcpArgs = $state('');
  let mcpTesting = $state<Record<string, boolean>>({});
  let mcpStatus = $state<Record<string, string>>({});
  let addingSlashDir = $state(false);

  const PRESETS = [
    { name: 'Filesystem', command: 'npx', args: '-y @modelcontextprotocol/server-filesystem /' },
    { name: 'GitHub', command: 'npx', args: '-y @modelcontextprotocol/server-github' },
    { name: 'SQLite', command: 'npx', args: '-y @modelcontextprotocol/server-sqlite' },
    { name: 'Brave Search', command: 'npx', args: '-y @modelcontextprotocol/server-brave-search' },
    { name: 'Memory', command: 'npx', args: '-y @modelcontextprotocol/server-memory' },
  ];

  function applyPreset(preset: typeof PRESETS[number]) {
    transportTab = 'stdio';
    newMcpName = preset.name;
    newMcpCommand = preset.command;
    newMcpArgs = preset.args;
  }

  function parseArgsString(argsStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of argsStr) {
      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ') {
        if (current) {
          result.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) result.push(current);
    return result;
  }

  function addMcpServer() {
    const name = newMcpName.trim();
    if (!name) return;

    const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (transportTab === 'stdio') {
      const command = newMcpCommand.trim();
      if (!command) return;

      const server: MCPServerConfig = {
        id,
        name,
        enabled: true,
        timeoutMs: 30000,
        transport: 'stdio',
        url: '',
        authToken: '',
        headersJson: '{}',
        command,
        args: parseArgsString(newMcpArgs),
        env: {},
      };
      updateSetting('mcpServers', [...$settings.mcpServers, server]);
    } else {
      const url = newMcpUrl.trim();
      if (!url) return;

      const server: MCPServerConfig = {
        id,
        name,
        url,
        enabled: true,
        transport: 'http',
        authToken: newMcpToken.trim(),
        headersJson: newMcpHeaders.trim() || '{}',
        timeoutMs: Number(newMcpTimeoutMs) || 20000,
        command: '',
        args: [],
        env: {},
      };
      updateSetting('mcpServers', [...$settings.mcpServers, server]);
    }

    newMcpName = '';
    newMcpUrl = '';
    newMcpToken = '';
    newMcpHeaders = '{}';
    newMcpTimeoutMs = 20000;
    newMcpCommand = '';
    newMcpArgs = '';
  }

  function updateMcpServer(id: string, patch: Partial<AppSettings['mcpServers'][number]>) {
    updateSetting(
      'mcpServers',
      $settings.mcpServers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  }

  async function removeMcpServer(id: string) {
    const server = $settings.mcpServers.find((s) => s.id === id);
    if (server && (server.transport || 'http') === 'stdio') {
      try { await stdioMcpStop(id); } catch { /* ignore */ }
    }
    updateSetting(
      'mcpServers',
      $settings.mcpServers.filter((server) => server.id !== id),
    );
  }

  async function testMcpServer(id: string) {
    const server = $settings.mcpServers.find((s) => s.id === id);
    if (!server) return;

    mcpTesting = { ...mcpTesting, [id]: true };
    mcpStatus = { ...mcpStatus, [id]: 'Testing...' };

    try {
      const transport = server.transport || 'http';
      let raw: string;

      if (transport === 'stdio') {
        // Ensure server is running
        try {
          const status = await stdioMcpStatus(id);
          if (status !== 'running') {
            await stdioMcpSpawn(id, server.command, server.args || [], server.env || {});
          }
        } catch {
          await stdioMcpSpawn(id, server.command, server.args || [], server.env || {});
        }
        raw = await stdioMcpListTools(id);
      } else {
        raw = await mcpListTools(
          server.url,
          server.authToken || undefined,
          server.headersJson || undefined,
          server.timeoutMs,
        );
      }

      const parsed = JSON.parse(raw);
      const count = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
      mcpStatus = { ...mcpStatus, [id]: `Connected (${count} tools)` };
    } catch (e) {
      mcpStatus = { ...mcpStatus, [id]: `Failed: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      mcpTesting = { ...mcpTesting, [id]: false };
    }
  }

  async function addSlashCommandDirectory() {
    if (addingSlashDir) return;
    addingSlashDir = true;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Slash Command Folder',
      });
      if (!selected || typeof selected !== 'string') return;
      if ($settings.aiSlashCommandDirs.includes(selected)) return;
      updateSetting('aiSlashCommandDirs', [...$settings.aiSlashCommandDirs, selected]);
    } finally {
      addingSlashDir = false;
    }
  }

  function removeSlashCommandDirectory(path: string) {
    updateSetting(
      'aiSlashCommandDirs',
      $settings.aiSlashCommandDirs.filter((p) => p !== path),
    );
  }
</script>

<div style="display: flex; flex-direction: column; gap: 24px;">
  <!-- Tool Use Capabilities -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
    <!-- Enable Tool Use -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Enable Tool Use</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Read/write files, run commands</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiEnableToolUse ? 'bg-accent' : 'bg-bg-active'}"
        style="width: 46px; height: 26px;"
        onclick={() => updateSetting('aiEnableToolUse', !$settings.aiEnableToolUse)}
      >
        <div class="absolute rounded-full bg-white shadow transition-transform {$settings.aiEnableToolUse ? 'translate-x-[22px]' : 'translate-x-[2px]'}" style="top: 2px; width: 22px; height: 22px;"></div>
      </div>
    </div>

    <!-- YOLO Mode -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">YOLO Mode (No Confirmations)</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Allow MCP, shell, and write tools without approval prompts</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiYoloMode ? 'bg-accent' : 'bg-bg-active'}"
        style="width: 46px; height: 26px;"
        onclick={() => updateSetting('aiYoloMode', !$settings.aiYoloMode)}
      >
        <div class="absolute rounded-full bg-white shadow transition-transform {$settings.aiYoloMode ? 'translate-x-[22px]' : 'translate-x-[2px]'}" style="top: 2px; width: 22px; height: 22px;"></div>
      </div>
    </div>

    <!-- Confirm Writes -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Confirm Writes</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Ask before destructive actions</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiConfirmWrites ? 'bg-accent' : 'bg-bg-active'} {$settings.aiYoloMode ? 'opacity-40 pointer-events-none' : ''}"
        style="width: 46px; height: 26px;"
        onclick={() => updateSetting('aiConfirmWrites', !$settings.aiConfirmWrites)}
      >
        <div class="absolute rounded-full bg-white shadow transition-transform {$settings.aiConfirmWrites ? 'translate-x-[22px]' : 'translate-x-[2px]'}" style="top: 2px; width: 22px; height: 22px;"></div>
      </div>
    </div>

    <!-- Max Tool Iterations -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Max Tool Iterations</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Maximum tool use loops per message</div>
      </div>
      <input
        type="number"
        min="1"
        max="50"
        class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13.5px] outline-none focus:border-accent/40 text-center font-mono transition-colors"
        style="padding: 8px 16px; width: 100px;"
        value={$settings.aiMaxToolIterations}
        oninput={(e) => updateSetting('aiMaxToolIterations', Number(e.currentTarget.value))}
      />
    </div>
  </div>

  <!-- Slash Command Folders -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
    <div style="padding: 24px 28px;">
      <div>
        <div class="text-text-primary text-[13.5px] font-medium">Slash Command Folders</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Load custom /commands from Markdown or JSON files in these folders.</div>
      </div>
      <button
        class="rounded-md bg-accent/20 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50 text-[12px]"
        style="padding: 8px 12px; margin-top: 12px;"
        onclick={addSlashCommandDirectory}
        disabled={addingSlashDir}
      >
        {addingSlashDir ? 'Selecting...' : 'Add Folder'}
      </button>
    </div>

    {#if $settings.aiSlashCommandDirs.length > 0}
      <div style="padding: 16px 28px;">
        {#each $settings.aiSlashCommandDirs as dir}
          <div class="flex items-center rounded-lg border border-border/30 bg-bg-primary/45" style="gap: 8px; padding: 10px; margin-bottom: 8px;">
            <div class="flex-1 text-[12px] text-text-secondary font-mono truncate" title={dir}>{dir}</div>
            <button
              class="rounded border border-border/40 text-text-muted hover:text-error text-[11px]"
              style="padding: 4px 8px;"
              onclick={() => removeSlashCommandDirectory(dir)}
            >
              Remove
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- MCP Servers -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
    <div style="padding: 24px 28px;">
      <div>
        <div class="text-text-primary text-[13.5px] font-medium">MCP Servers</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Connect local or remote MCP tool servers to AI chat.</div>
      </div>

      <!-- Quick-add presets -->
      <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px;">
        {#each PRESETS as preset}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="rounded-md border border-border/30 text-text-muted hover:text-accent hover:border-accent/40 cursor-pointer transition-colors text-[11px]"
            style="padding: 4px 10px;"
            onclick={() => applyPreset(preset)}
          >
            {preset.name}
          </div>
        {/each}
      </div>

      <!-- Transport tabs -->
      <div class="flex" style="gap: 0; margin-top: 16px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.12));">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cursor-pointer text-[12.5px] transition-colors {transportTab === 'stdio' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}"
          style="padding: 8px 16px;"
          onclick={() => (transportTab = 'stdio')}
        >
          Local (Stdio)
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cursor-pointer text-[12.5px] transition-colors {transportTab === 'http' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'}"
          style="padding: 8px 16px;"
          onclick={() => (transportTab = 'http')}
        >
          Remote (HTTP)
        </div>
      </div>

      {#if transportTab === 'stdio'}
        <!-- Stdio form -->
        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px;">
          <input
            type="text"
            class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] outline-none focus:border-accent/40"
            style="padding: 8px 12px;"
            placeholder="Server name (e.g. Filesystem)"
            bind:value={newMcpName}
          />
          <div class="grid grid-cols-[1fr_2fr]" style="gap: 10px;">
            <input
              type="text"
              class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] font-mono outline-none focus:border-accent/40"
              style="padding: 8px 12px;"
              placeholder="Command (e.g. npx)"
              bind:value={newMcpCommand}
            />
            <input
              type="text"
              class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] font-mono outline-none focus:border-accent/40"
              style="padding: 8px 12px;"
              placeholder="Arguments (e.g. -y @modelcontextprotocol/server-filesystem /path)"
              bind:value={newMcpArgs}
            />
          </div>
        </div>
      {:else}
        <!-- HTTP form -->
        <div class="grid grid-cols-2" style="gap: 12px; margin-top: 12px;">
          <input
            type="text"
            class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] outline-none focus:border-accent/40"
            style="padding: 8px 12px;"
            placeholder="Server name"
            bind:value={newMcpName}
          />
          <input
            type="text"
            class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] outline-none focus:border-accent/40 font-mono"
            style="padding: 8px 12px;"
            placeholder="https://mcp.example.com"
            bind:value={newMcpUrl}
          />
          <input
            type="password"
            class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] outline-none focus:border-accent/40"
            style="padding: 8px 12px;"
            placeholder="Bearer token (optional)"
            bind:value={newMcpToken}
          />
          <input
            type="number"
            min="1000"
            max="120000"
            class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13px] outline-none focus:border-accent/40"
            style="padding: 8px 12px;"
            placeholder="Timeout ms"
            bind:value={newMcpTimeoutMs}
          />
        </div>

        <textarea
          class="w-full bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
          style="padding: 8px 12px; margin-top: 12px;"
          rows="2"
          placeholder="Headers JSON (optional)"
          bind:value={newMcpHeaders}
        ></textarea>
      {/if}

      <button
        class="rounded-md bg-accent/20 border border-accent/30 text-accent hover:bg-accent/25 transition-colors text-[12px]"
        style="padding: 8px 12px; margin-top: 12px;"
        onclick={addMcpServer}
      >
        Add MCP Server
      </button>
    </div>

    {#if $settings.mcpServers.length > 0}
      <div style="padding: 16px 28px;">
        {#each $settings.mcpServers as server (server.id)}
          {@const transport = server.transport || 'http'}
          <div class="rounded-lg border border-border/30 bg-bg-primary/45" style="padding: 14px; margin-bottom: 12px;">
            <div class="flex items-center" style="gap: 8px;">
              <span
                class="rounded text-[10px] font-medium uppercase shrink-0 {transport === 'stdio' ? 'bg-green-500/15 text-green-400 border border-green-500/25' : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'}"
                style="padding: 2px 6px;"
              >
                {transport}
              </span>
              <input
                type="text"
                class="flex-1 bg-transparent border border-border/30 rounded-md text-[12.5px] text-text-primary outline-none focus:border-accent/40"
                style="padding: 4px 8px;"
                value={server.name}
                oninput={(e) => updateMcpServer(server.id, { name: e.currentTarget.value })}
              />
              <button
                class="rounded border border-border/40 text-text-muted hover:text-text-primary text-[11px]"
                style="padding: 4px 8px;"
                onclick={() => updateMcpServer(server.id, { enabled: !server.enabled })}
              >
                {server.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                class="rounded border border-border/40 text-text-muted hover:text-error text-[11px]"
                style="padding: 4px 8px;"
                onclick={() => removeMcpServer(server.id)}
              >
                Remove
              </button>
            </div>

            {#if transport === 'stdio'}
              <div class="font-mono text-[12px] text-text-secondary truncate" style="margin-top: 8px;" title="{server.command} {(server.args || []).join(' ')}">
                {server.command} {(server.args || []).join(' ')}
              </div>
            {:else}
              <input
                type="text"
                class="w-full bg-transparent border border-border/30 rounded-md text-[12px] text-text-secondary font-mono outline-none focus:border-accent/40"
                style="padding: 4px 8px; margin-top: 8px;"
                value={server.url}
                oninput={(e) => updateMcpServer(server.id, { url: e.currentTarget.value })}
              />

              <div class="grid grid-cols-2" style="gap: 8px; margin-top: 8px;">
                <input
                  type="password"
                  class="bg-transparent border border-border/30 rounded-md text-[12px] text-text-secondary outline-none focus:border-accent/40"
                  style="padding: 4px 8px;"
                  placeholder="Bearer token"
                  value={server.authToken}
                  oninput={(e) => updateMcpServer(server.id, { authToken: e.currentTarget.value })}
                />
                <input
                  type="number"
                  min="1000"
                  max="120000"
                  class="bg-transparent border border-border/30 rounded-md text-[12px] text-text-secondary outline-none focus:border-accent/40"
                  style="padding: 4px 8px;"
                  value={server.timeoutMs}
                  oninput={(e) => updateMcpServer(server.id, { timeoutMs: Number(e.currentTarget.value) || 20000 })}
                />
              </div>

              <textarea
                class="w-full bg-transparent border border-border/30 rounded-md text-[11px] text-text-secondary font-mono outline-none focus:border-accent/40"
                style="padding: 4px 8px; margin-top: 8px;"
                rows="2"
                placeholder="Headers JSON (optional)"
                value={server.headersJson}
                oninput={(e) => updateMcpServer(server.id, { headersJson: e.currentTarget.value })}
              ></textarea>
            {/if}

            <div class="flex items-center" style="gap: 8px; margin-top: 8px;">
              <button
                class="rounded border border-border/40 text-text-muted hover:text-text-primary disabled:opacity-50 text-[11px]"
                style="padding: 4px 8px;"
                onclick={() => testMcpServer(server.id)}
                disabled={mcpTesting[server.id]}
              >
                {mcpTesting[server.id] ? 'Testing...' : 'Test'}
              </button>
              {#if mcpStatus[server.id]}
                <span class="text-[11px] {mcpStatus[server.id]?.startsWith('Connected') ? 'text-green-400' : mcpStatus[server.id]?.startsWith('Failed') ? 'text-red-400' : 'text-text-muted'}">
                  {mcpStatus[server.id]}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 28px;
  }
</style>
