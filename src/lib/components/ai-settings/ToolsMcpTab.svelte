<script lang="ts">
  import { settings, updateSetting } from '$lib/stores/settings';
  import type { AppSettings } from '$lib/stores/settings';
  import { mcpListTools } from '$lib/utils/tauri';

  let newMcpName = $state('');
  let newMcpUrl = $state('');
  let newMcpToken = $state('');
  let newMcpHeaders = $state('{}');
  let newMcpTimeoutMs = $state(20000);
  let mcpTesting = $state<Record<string, boolean>>({});
  let mcpStatus = $state<Record<string, string>>({});
  let addingSlashDir = $state(false);

  function addMcpServer() {
    const name = newMcpName.trim();
    const url = newMcpUrl.trim();
    if (!name || !url) return;

    const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    updateSetting('mcpServers', [
      ...$settings.mcpServers,
      {
        id,
        name,
        url,
        enabled: true,
        authToken: newMcpToken.trim(),
        headersJson: newMcpHeaders.trim() || '{}',
        timeoutMs: Number(newMcpTimeoutMs) || 20000,
      },
    ]);

    newMcpName = '';
    newMcpUrl = '';
    newMcpToken = '';
    newMcpHeaders = '{}';
    newMcpTimeoutMs = 20000;
  }

  function updateMcpServer(id: string, patch: Partial<AppSettings['mcpServers'][number]>) {
    updateSetting(
      'mcpServers',
      $settings.mcpServers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  }

  function removeMcpServer(id: string) {
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
      const raw = await mcpListTools(
        server.url,
        server.authToken || undefined,
        server.headersJson || undefined,
        server.timeoutMs,
      );
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
        <div class="text-text-primary text-[13.5px] font-medium">Remote MCP Servers (HTTP)</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Link HTTP MCP servers and expose their tools to AI chat.</div>
      </div>

      <div class="grid grid-cols-2" style="gap: 12px; margin-top: 16px;">
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
          <div class="rounded-lg border border-border/30 bg-bg-primary/45" style="padding: 14px; margin-bottom: 12px;">
            <div class="flex items-center" style="gap: 8px;">
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
                <span class="text-[11px] text-text-muted">{mcpStatus[server.id]}</span>
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
