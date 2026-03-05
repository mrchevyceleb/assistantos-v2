<script lang="ts">
  import { settings, updateSetting, getActiveAIKey, getActiveAIBaseUrl } from "$lib/stores/settings";
  import type { AppSettings } from "$lib/stores/settings";
  import { uiZoom, applyZoom } from "$lib/stores/ui";
  import { availableModels, modelsLoading, modelsError, fetchModels, modelsLastFetched, TOP_PROVIDERS } from "$lib/stores/models";
  import type { OpenRouterModel } from "$lib/stores/models";
  import { mcpListTools } from "$lib/utils/tauri";

  let modelSearch = $state('');
  let modelDropdownOpen = $state(false);
  type ModelView = 'top' | 'new' | 'all';
  let modelView = $state<ModelView>('top');

  const searchQuery = $derived(modelSearch.toLowerCase());
  const isSearching = $derived(searchQuery.length > 0);

  /** All models matching the search query (or all if no search) */
  const filteredModels = $derived(
    isSearching
      ? $availableModels.filter(m =>
          m.id.toLowerCase().includes(searchQuery) ||
          m.name.toLowerCase().includes(searchQuery)
        )
      : $availableModels
  );

  /** Models from top providers, sorted alphabetically */
  const topProviderModels = $derived(
    filteredModels.filter(m => TOP_PROVIDERS.some(p => m.id.startsWith(p)))
  );

  /** Models added in the last 30 days, sorted newest first */
  const recentModels = $derived(() => {
    const thirtyDaysAgo = (Date.now() / 1000) - (30 * 24 * 60 * 60);
    return filteredModels
      .filter(m => m.created && m.created > thirtyDaysAgo)
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  });

  /** The list currently being displayed based on the active tab */
  const displayedModels = $derived(
    isSearching
      ? filteredModels
      : modelView === 'top'
        ? topProviderModels
        : modelView === 'new'
          ? recentModels()
          : filteredModels
  );

  function selectModel(modelId: string) {
    updateSetting("aiModel", modelId);
    modelSearch = '';
    modelDropdownOpen = false;
  }

  function toggleFavorite(modelId: string) {
    const favs = [...$settings.aiFavoriteModels];
    const idx = favs.indexOf(modelId);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push(modelId);
    }
    updateSetting("aiFavoriteModels", favs);
  }

  function isFavorite(modelId: string): boolean {
    return $settings.aiFavoriteModels.includes(modelId);
  }

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

  type Category = "Terminal" | "Editor" | "Appearance" | "File Explorer" | "General" | "AI Chat";

  let activeCategory = $state<Category>("Terminal");

  let newMcpName = $state("");
  let newMcpUrl = $state("");
  let newMcpToken = $state("");
  let newMcpHeaders = $state("{}");
  let newMcpTimeoutMs = $state(20000);
  let mcpTesting = $state<Record<string, boolean>>({});
  let mcpStatus = $state<Record<string, string>>({});
  let addingSlashDir = $state(false);
  let openRouterAuthCode = $state("");
  let openRouterCodeVerifier = $state("");
  let openRouterOauthBusy = $state(false);
  let openRouterOauthStatus = $state("");

  type AIProvider = AppSettings["aiProvider"];
  type AIAuthMode = AppSettings["aiAuthMode"];

  const categories: Category[] = [
    "Terminal",
    "Editor",
    "Appearance",
    "File Explorer",
    "General",
    "AI Chat",
  ];

  const categoryIcons: Record<Category, string> = {
    Terminal: "M4 17l6-6-6-6M12 19h8",
    Editor: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7",
    Appearance: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    "File Explorer": "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    General: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    "AI Chat": "M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z",
  };

  const categoryDescriptions: Record<Category, string> = {
    Terminal: "Shell, font, and cursor preferences",
    Editor: "Code editing behavior and formatting",
    Appearance: "Theme and display scaling",
    "File Explorer": "File browser visibility options",
    General: "Startup and session behavior",
    "AI Chat": "API keys, models, and generation settings",
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  function addMcpServer() {
    const name = newMcpName.trim();
    const url = newMcpUrl.trim();
    if (!name || !url) return;

    const id = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    updateSetting("mcpServers", [
      ...$settings.mcpServers,
      {
        id,
        name,
        url,
        enabled: true,
        authToken: newMcpToken.trim(),
        headersJson: newMcpHeaders.trim() || "{}",
        timeoutMs: Number(newMcpTimeoutMs) || 20000,
      },
    ]);

    newMcpName = "";
    newMcpUrl = "";
    newMcpToken = "";
    newMcpHeaders = "{}";
    newMcpTimeoutMs = 20000;
  }

  function updateMcpServer(id: string, patch: Partial<AppSettings["mcpServers"][number]>) {
    updateSetting(
      "mcpServers",
      $settings.mcpServers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  }

  function removeMcpServer(id: string) {
    updateSetting(
      "mcpServers",
      $settings.mcpServers.filter((server) => server.id !== id),
    );
  }

  async function testMcpServer(id: string) {
    const server = $settings.mcpServers.find((s) => s.id === id);
    if (!server) return;

    mcpTesting = { ...mcpTesting, [id]: true };
    mcpStatus = { ...mcpStatus, [id]: "Testing..." };

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
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Slash Command Folder",
      });

      if (!selected || typeof selected !== "string") return;
      if ($settings.aiSlashCommandDirs.includes(selected)) return;

      updateSetting("aiSlashCommandDirs", [...$settings.aiSlashCommandDirs, selected]);
    } finally {
      addingSlashDir = false;
    }
  }

  function removeSlashCommandDirectory(path: string) {
    updateSetting(
      "aiSlashCommandDirs",
      $settings.aiSlashCommandDirs.filter((p) => p !== path),
    );
  }

  function providerDisplayName(provider: AIProvider): string {
    if (provider === "anthropic") return "Anthropic Direct";
    if (provider === "openai") return "OpenAI Direct (Codex)";
    if (provider === "lmstudio") return "LM Studio (Local)";
    return "OpenRouter";
  }

  function activeApiKey(): string {
    return getActiveAIKey($settings);
  }

  function setActiveApiKey(value: string) {
    if ($settings.aiProvider === "anthropic") {
      updateSetting("aiAnthropicApiKey", value);
      return;
    }
    if ($settings.aiProvider === "openai") {
      updateSetting("aiOpenAIApiKey", value);
      return;
    }
    if ($settings.aiProvider === "lmstudio") return; // no API key needed
    updateSetting("aiOpenRouterApiKey", value);
    updateSetting("aiApiKey", value);
  }

  function activeBaseUrl(): string {
    return getActiveAIBaseUrl($settings);
  }

  function setActiveBaseUrl(value: string) {
    if ($settings.aiProvider === "anthropic") {
      updateSetting("aiAnthropicBaseUrl", value);
      return;
    }
    if ($settings.aiProvider === "openai") {
      updateSetting("aiOpenAIBaseUrl", value);
      return;
    }
    if ($settings.aiProvider === "lmstudio") {
      updateSetting("aiLMStudioBaseUrl", value);
      return;
    }
    updateSetting("aiOpenRouterBaseUrl", value);
    updateSetting("aiBaseUrl", value);
  }

  function setProvider(provider: AIProvider) {
    updateSetting("aiProvider", provider);
    if (provider === "anthropic" && !$settings.aiModel.toLowerCase().includes("claude")) {
      updateSetting("aiModel", "claude-sonnet-4-5");
    }
    if (provider === "openai" && !$settings.aiModel.toLowerCase().includes("gpt") && !$settings.aiModel.toLowerCase().includes("codex")) {
      updateSetting("aiModel", "gpt-5.2");
    }
    if (provider === "openrouter" && !$settings.aiModel.includes("/")) {
      updateSetting("aiModel", "anthropic/claude-sonnet-4");
    }
    if (provider === "lmstudio") {
      // LM Studio models don't have prefixes; auto-fetch available models
      fetchModels();
    }
    modelSearch = "";
    modelDropdownOpen = false;
  }

  async function openProviderLogin() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    if ($settings.aiProvider === "anthropic") {
      await openUrl("https://console.anthropic.com");
      return;
    }
    if ($settings.aiProvider === "openai") {
      await openUrl("https://platform.openai.com");
      return;
    }
    await startOpenRouterOAuth();
  }

  function randomVerifier(length = 64): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  async function sha256Base64Url(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const bytes = Array.from(new Uint8Array(digest));
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function startOpenRouterOAuth() {
    if (openRouterOauthBusy) return;
    openRouterOauthBusy = true;
    openRouterOauthStatus = "";

    try {
      const verifier = randomVerifier(64);
      openRouterCodeVerifier = verifier;
      const challenge = await sha256Base64Url(verifier);
      const callbackUrl = "http://localhost:3000/openrouter-oauth-callback";
      const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(authUrl);
      openRouterOauthStatus = "Browser opened. After login, paste the returned code below.";
    } catch (e) {
      openRouterOauthStatus = `OAuth start failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openRouterOauthBusy = false;
    }
  }

  async function exchangeOpenRouterOAuthCode() {
    const code = openRouterAuthCode.trim();
    if (!code) return;
    if (!openRouterCodeVerifier) {
      openRouterOauthStatus = "Start OAuth first so a code verifier is generated.";
      return;
    }

    openRouterOauthBusy = true;
    openRouterOauthStatus = "Exchanging code...";
    try {
      const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          code_verifier: openRouterCodeVerifier,
          code_challenge_method: "S256",
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }

      const parsed = JSON.parse(text);
      const key = parsed?.key;
      if (!key || typeof key !== "string") {
        throw new Error("OAuth exchange succeeded but no key was returned.");
      }

      updateSetting("aiProvider", "openrouter");
      updateSetting("aiAuthMode", "oauth");
      updateSetting("aiOpenRouterApiKey", key);
      updateSetting("aiApiKey", key);
      openRouterAuthCode = "";
      openRouterOauthStatus = "Connected. OpenRouter OAuth key saved.";
    } catch (e) {
      openRouterOauthStatus = `OAuth exchange failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openRouterOauthBusy = false;
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="settings-modal fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="settings-panel w-[1080px] max-h-[90vh] min-h-[620px] glass-panel-solid border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-8 py-5 border-b border-border/40">
        <h2 class="text-text-primary text-lg font-semibold tracking-wide">Settings</h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          onclick={onClose}
          aria-label="Close settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Body: sidebar + content -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left sidebar -->
        <div class="w-[280px] border-r border-border/40 py-5 shrink-0 flex flex-col gap-1.5">
          {#each categories as cat}
            <button
              class="flex items-center gap-3.5 mx-3 px-4 py-3.5 text-left rounded-lg transition-all
                {activeCategory === cat
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-primary'}"
              style="font-size: calc(16.5px * var(--ui-zoom));"
              onclick={() => activeCategory = cat}
            >
              <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                <path d={categoryIcons[cat]}/>
              </svg>
              {cat}
            </button>
          {/each}
        </div>

        <!-- Right content -->
        <div class="flex-1 overflow-y-auto px-10 py-8">
          <!-- Section header -->
          <div class="mb-8">
            <h3 class="text-text-primary text-[16px] font-semibold">{activeCategory}</h3>
            <p class="text-text-muted text-[13px] mt-1.5">{categoryDescriptions[activeCategory]}</p>
          </div>

          {#if activeCategory === "Terminal"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Default dock position -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Default dock position</div>
                  <div class="text-text-muted text-[12px] mt-1">Where new terminals open</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.defaultTerminalDock}
                  onchange={(e) => updateSetting("defaultTerminalDock", e.currentTarget.value as AppSettings["defaultTerminalDock"])}
                >
                  <option value="bottom">Bottom</option>
                  <option value="right">Right</option>
                  <option value="tab">Tab</option>
                  <option value="left">Left</option>
                </select>
              </div>

              <!-- Default shell -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Default shell</div>
                  <div class="text-text-muted text-[12px] mt-1">Shell used for new terminals</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.defaultShell}
                  onchange={(e) => updateSetting("defaultShell", e.currentTarget.value as AppSettings["defaultShell"])}
                >
                  <option value="auto">Auto</option>
                  <option value="powershell">PowerShell</option>
                  <option value="bash">Bash</option>
                  <option value="cmd">CMD</option>
                </select>
              </div>

              <!-- Terminal font size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.terminalFontSize}
                    oninput={(e) => updateSetting("terminalFontSize", Number(e.currentTarget.value))}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[2.5rem] text-center font-mono">{$settings.terminalFontSize}</span>
                </div>
              </div>

              <!-- Cursor style -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Cursor style</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.terminalCursorStyle}
                  onchange={(e) => updateSetting("terminalCursorStyle", e.currentTarget.value as AppSettings["terminalCursorStyle"])}
                >
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                  <option value="bar">Bar</option>
                </select>
              </div>

              <!-- Terminal style -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Terminal style</div>
                  <div class="text-text-muted text-[12px] mt-1">Visual preset for terminal panels</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.terminalStylePreset}
                  onchange={(e) => updateSetting("terminalStylePreset", e.currentTarget.value as AppSettings["terminalStylePreset"])}
                >
                  <option value="metal">Brushed Metal</option>
                  <option value="minimal">Minimal</option>
                  <option value="retro">Retro</option>
                  <option value="high-contrast">High Contrast</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "Editor"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Editor font size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.editorFontSize}
                    oninput={(e) => updateSetting("editorFontSize", Number(e.currentTarget.value))}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[2.5rem] text-center font-mono">{$settings.editorFontSize}</span>
                </div>
              </div>

              <!-- Tab size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Tab size</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.tabSize}
                  onchange={(e) => updateSetting("tabSize", Number(e.currentTarget.value))}
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </div>

              <!-- Word wrap -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Word wrap</div>
                  <div class="text-text-muted text-[12px] mt-1">Wrap long lines in the editor</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.wordWrap ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("wordWrap", !$settings.wordWrap)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.wordWrap ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>

              <!-- Auto-save delay -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Auto-save delay</div>
                  <div class="text-text-muted text-[12px] mt-1">Delay before auto-saving changes</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.autoSaveDelay}
                  onchange={(e) => updateSetting("autoSaveDelay", Number(e.currentTarget.value))}
                >
                  <option value={0}>Off</option>
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "Appearance"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- UI Zoom -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">UI Zoom</div>
                  <div class="text-text-muted text-[12px] mt-1">Scale the entire interface</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="240"
                    step="5"
                    value={Math.round($uiZoom * 100)}
                    oninput={(e) => {
                      const pct = Number(e.currentTarget.value);
                      const level = pct / 100;
                      uiZoom.set(level);
                      applyZoom(level);
                    }}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[3rem] text-center font-mono">{Math.round($uiZoom * 100)}%</span>
                </div>
              </div>

              <!-- Theme -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Theme</div>
                  <div class="text-text-muted text-[12px] mt-1">More themes coming soon</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none opacity-50 cursor-not-allowed"
                  value={$settings.theme}
                  disabled
                >
                  <option value="catppuccin-mocha">Liquid Metal</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "File Explorer"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- File tree font size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                  <div class="text-text-muted text-[12px] mt-1">File tree text size in pixels</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.fileTreeFontSize}
                    oninput={(e) => updateSetting("fileTreeFontSize", Number(e.currentTarget.value))}
                    class="w-24 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[3rem] text-center font-mono">{$settings.fileTreeFontSize}px</span>
                </div>
              </div>

              <!-- Show hidden files -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Show hidden files</div>
                  <div class="text-text-muted text-[12px] mt-1">Display files starting with a dot</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.showHiddenFiles ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("showHiddenFiles", !$settings.showHiddenFiles)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.showHiddenFiles ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
            </div>

          {:else if activeCategory === "General"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Restore session -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Restore session on startup</div>
                  <div class="text-text-muted text-[12px] mt-1">Re-open previous tabs and terminals</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.restoreSession ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("restoreSession", !$settings.restoreSession)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.restoreSession ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>

              <!-- Confirm close unsaved -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Confirm before closing unsaved tabs</div>
                  <div class="text-text-muted text-[12px] mt-1">Show a warning when closing tabs with unsaved changes</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.confirmCloseUnsaved ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("confirmCloseUnsaved", !$settings.confirmCloseUnsaved)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.confirmCloseUnsaved ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
            </div>

          {:else if activeCategory === "AI Chat"}
            <div class="space-y-6">

              <!-- Chat layout/preferences -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <!-- Chat font size -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Chat font size</div>
                    <div class="text-text-muted text-[12px] mt-1">Message text size in pixels (Ctrl+/- to adjust)</div>
                  </div>
                  <div class="flex items-center gap-3">
                    <input
                      type="range"
                      min="10"
                      max="24"
                      step="1"
                      value={$settings.aiChatFontSize}
                      oninput={(e) => updateSetting("aiChatFontSize", Number(e.currentTarget.value))}
                      class="w-24 accent-[var(--color-accent)]"
                    />
                    <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[3rem] text-center font-mono">{$settings.aiChatFontSize}px</span>
                  </div>
                </div>

                <!-- Chat font family -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Chat font</div>
                    <div class="text-text-muted text-[12px] mt-1">Font family for chat messages</div>
                  </div>
                  <select
                    class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                    value={$settings.aiChatFontFamily}
                    onchange={(e) => updateSetting("aiChatFontFamily", e.currentTarget.value)}
                  >
                    <option value="system">System Default</option>
                    <option value="inter">Inter</option>
                    <option value="jetbrains">JetBrains Mono</option>
                    <option value="cascadia">Cascadia Code</option>
                    <option value="fira">Fira Code</option>
                  </select>
                </div>

                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Chat dock position</div>
                    <div class="text-text-muted text-[12px] mt-1">Where AI chat appears in the workspace</div>
                  </div>
                  <select
                    class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                    value={$settings.aiChatDock}
                    onchange={(e) => updateSetting("aiChatDock", e.currentTarget.value as AppSettings["aiChatDock"])}
                  >
                    <option value="right">Right</option>
                    <option value="bottom">Bottom</option>
                    <option value="tab">Tab</option>
                  </select>
                </div>

                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Reload AGENTS/CLAUDE each message</div>
                    <div class="text-text-muted text-[12px] mt-1">Keeps workspace instructions in sync while files change</div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiReadInstructionsEveryMessage ? 'bg-accent' : 'bg-bg-active'}"
                    onclick={() => updateSetting("aiReadInstructionsEveryMessage", !$settings.aiReadInstructionsEveryMessage)}
                  >
                    <div class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiReadInstructionsEveryMessage ? 'translate-x-[22px]' : 'translate-x-[2px]'}"></div>
                  </div>
                </div>

                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Enable @ file tagging</div>
                    <div class="text-text-muted text-[12px] mt-1">Use @ in chat input to tag workspace files and folders</div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiEnableAtMentions ? 'bg-accent' : 'bg-bg-active'}"
                    onclick={() => updateSetting("aiEnableAtMentions", !$settings.aiEnableAtMentions)}
                  >
                    <div class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiEnableAtMentions ? 'translate-x-[22px]' : 'translate-x-[2px]'}"></div>
                  </div>
                </div>

                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Thinking Visibility</div>
                    <div class="text-text-muted text-[12px] mt-1">Choose how much reasoning text to show in messages</div>
                  </div>
                  <select
                    class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                    value={$settings.aiThinkingMode}
                    onchange={(e) => updateSetting("aiThinkingMode", e.currentTarget.value as AppSettings["aiThinkingMode"])}
                  >
                    <option value="all">Show All</option>
                    <option value="preview">Preview + Expand</option>
                    <option value="none">Hide</option>
                  </select>
                </div>
              </div>

              <!-- Slash command folders -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <div class="py-6 px-7 space-y-3">
                  <div>
                    <div class="text-text-primary text-[13.5px] font-medium">Slash Command Folders</div>
                    <div class="text-text-muted text-[12px] mt-1">Load custom /commands from Markdown or JSON files in these folders.</div>
                  </div>

                  <button
                    class="px-3 py-2 text-[12px] rounded-md bg-accent/20 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
                    onclick={addSlashCommandDirectory}
                    disabled={addingSlashDir}
                  >
                    {addingSlashDir ? 'Selecting...' : 'Add Folder'}
                  </button>
                </div>

                {#if $settings.aiSlashCommandDirs.length > 0}
                  <div class="py-4 px-7 space-y-2.5">
                    {#each $settings.aiSlashCommandDirs as dir}
                      <div class="flex items-center gap-2 rounded-lg border border-border/30 bg-bg-primary/45 p-2.5">
                        <div class="flex-1 text-[12px] text-text-secondary font-mono truncate" title={dir}>{dir}</div>
                        <button
                          class="px-2 py-1 text-[11px] rounded border border-border/40 text-text-muted hover:text-error"
                          onclick={() => removeSlashCommandDirectory(dir)}
                        >
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Connection card -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <div class="py-6 px-7 grid grid-cols-2 gap-4">
                  <div>
                    <div class="text-text-primary text-[13.5px] font-medium mb-1">Provider</div>
                    <div class="text-text-muted text-[12px] mb-3">Pick where chat requests are sent</div>
                    <select
                      class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                      value={$settings.aiProvider}
                      onchange={(e) => setProvider(e.currentTarget.value as AIProvider)}
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="anthropic">Anthropic Direct</option>
                      <option value="openai">OpenAI Direct (Codex)</option>
                      <option value="lmstudio">LM Studio (Local)</option>
                    </select>
                  </div>

                  <div>
                    <div class="text-text-primary text-[13.5px] font-medium mb-1">Auth Mode</div>
                    <div class="text-text-muted text-[12px] mb-3">API key or provider OAuth token</div>
                    <select
                      class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                      value={$settings.aiAuthMode}
                      onchange={(e) => updateSetting("aiAuthMode", e.currentTarget.value as AIAuthMode)}
                    >
                      <option value="apiKey">API Key</option>
                      <option value="oauth">Provider OAuth</option>
                    </select>
                  </div>
                </div>

                <div class="py-6 px-7">
                  <div class="text-text-primary text-[13.5px] font-medium mb-1">{providerDisplayName($settings.aiProvider)} Credential</div>
                  <div class="text-text-muted text-[12px] mb-4">
                    {$settings.aiAuthMode === "oauth"
                      ? "OAuth access token (or provider-issued key)."
                      : "API key for the selected provider."}
                  </div>
                  <input
                    type="password"
                    class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13.5px] font-mono outline-none focus:border-accent/40 transition-colors"
                    value={activeApiKey()}
                    oninput={(e) => setActiveApiKey(e.currentTarget.value)}
                    disabled={$settings.aiProvider === "lmstudio"}
                    placeholder={$settings.aiProvider === "lmstudio" ? "Not required" : $settings.aiProvider === "openrouter" ? "sk-or-..." : $settings.aiProvider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  />
                </div>

                <!-- API Base URL -->
                <div class="py-6 px-7">
                  <div class="text-text-primary text-[13.5px] font-medium mb-1">API Base URL</div>
                  <div class="text-text-muted text-[12px] mb-4">Override endpoint for {providerDisplayName($settings.aiProvider)}</div>
                  <input
                    type="text"
                    class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13.5px] font-mono outline-none focus:border-accent/40 transition-colors"
                    value={activeBaseUrl()}
                    oninput={(e) => setActiveBaseUrl(e.currentTarget.value)}
                  />
                </div>

                {#if $settings.aiAuthMode === "oauth"}
                  <div class="py-6 px-7 space-y-3">
                    <div class="text-text-primary text-[13.5px] font-medium">OAuth Connect</div>
                    {#if $settings.aiProvider === "openrouter"}
                      <div class="flex items-center gap-2">
                        <button
                          class="px-3 py-2 text-[12px] rounded-md bg-accent/20 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
                          onclick={startOpenRouterOAuth}
                          disabled={openRouterOauthBusy}
                        >
                          {openRouterOauthBusy ? "Starting..." : "Start OpenRouter OAuth"}
                        </button>
                      </div>
                      <input
                        type="text"
                        class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13px] font-mono outline-none focus:border-accent/40 transition-colors"
                        placeholder="Paste OAuth code from redirected URL"
                        bind:value={openRouterAuthCode}
                      />
                      <button
                        class="px-3 py-2 text-[12px] rounded-md border border-border/40 text-text-primary hover:border-accent/30 transition-colors disabled:opacity-50"
                        onclick={exchangeOpenRouterOAuthCode}
                        disabled={openRouterOauthBusy || !openRouterAuthCode.trim()}
                      >
                        Exchange Code for Key
                      </button>
                      {#if openRouterOauthStatus}
                        <div class="text-text-muted text-[12px]">{openRouterOauthStatus}</div>
                      {/if}
                    {:else}
                      <div class="text-text-muted text-[12px]">
                        Direct OAuth token flows vary by provider plan. Use the button below to open your provider portal and paste the issued token/key above.
                      </div>
                      <button
                        class="px-3 py-2 text-[12px] rounded-md border border-border/40 text-text-primary hover:border-accent/30 transition-colors"
                        onclick={openProviderLogin}
                      >
                        Open {$settings.aiProvider === "anthropic" ? "Anthropic" : $settings.aiProvider === "lmstudio" ? "LM Studio" : "OpenAI"} Portal
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Model card -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
                <div class="py-6 px-7">
                  <div class="flex justify-between items-center mb-4">
                    <div>
                      <div class="text-text-primary text-[13.5px] font-medium">Model</div>
                      <div class="text-text-muted text-[12px] mt-1">Current: <span class="text-accent font-mono">{$settings.aiModel}</span></div>
                    </div>
                    <button
                      class="px-4 py-2 text-[13px] rounded-lg border border-border/40 text-text-muted hover:text-text-primary hover:border-accent/30 transition-colors flex items-center gap-2
                        {$modelsLoading ? 'opacity-50 pointer-events-none' : ''}"
                      onclick={() => fetchModels()}
                      disabled={$modelsLoading || (!activeApiKey() && $settings.aiProvider !== "anthropic" && $settings.aiProvider !== "lmstudio")}
                    >
                      {#if $modelsLoading}
                        <span class="inline-block w-3.5 h-3.5 border-2 border-accent/50 border-t-transparent rounded-full animate-spin"></span>
                        Loading...
                      {:else}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
                        {$availableModels.length > 0 ? `Refresh (${$availableModels.length})` : 'Load Models'}
                      {/if}
                    </button>
                  </div>

                  {#if $modelsError}
                    <div class="text-red-400 text-[13px] mb-3">{$modelsError}</div>
                  {/if}

                  {#if $availableModels.length > 0}
                    <!-- Search input -->
                    <div class="relative mb-3">
                      <input
                        type="text"
                        class="w-full bg-bg-primary border border-border/40 rounded-lg px-4 py-2.5 text-text-primary text-[13.5px] outline-none focus:border-accent/40 pl-10 transition-colors"
                        bind:value={modelSearch}
                        placeholder="Search {$availableModels.length} models..."
                        onfocus={() => modelDropdownOpen = true}
                      />
                      <svg class="absolute left-3 top-3 text-text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>

                    <!-- Tab bar (hidden when actively searching) -->
                    {#if !isSearching}
                      <div class="flex gap-1 mb-3 border-b border-border/20 pb-0.5">
                        <button
                          class="px-3 py-1.5 text-[13px] rounded-t-md transition-colors {modelView === 'top' ? 'text-accent border-b-2 border-accent font-medium' : 'text-text-muted hover:text-text-primary'}"
                          onclick={() => { modelView = 'top'; modelDropdownOpen = true; }}
                        >Top Providers</button>
                        <button
                          class="px-3 py-1.5 text-[13px] rounded-t-md transition-colors {modelView === 'new' ? 'text-accent border-b-2 border-accent font-medium' : 'text-text-muted hover:text-text-primary'}"
                          onclick={() => { modelView = 'new'; modelDropdownOpen = true; }}
                        >Recently Added</button>
                        <button
                          class="px-3 py-1.5 text-[13px] rounded-t-md transition-colors {modelView === 'all' ? 'text-accent border-b-2 border-accent font-medium' : 'text-text-muted hover:text-text-primary'}"
                          onclick={() => { modelView = 'all'; modelDropdownOpen = true; }}
                        >All Models</button>
                      </div>
                    {/if}

                    <!-- Model list -->
                    {#if modelDropdownOpen || isSearching}
                      {#if isSearching}
                        <div class="text-text-muted text-[12px] mb-1.5 px-1">{filteredModels.length} result{filteredModels.length !== 1 ? 's' : ''}</div>
                      {/if}
                      <div class="max-h-[280px] overflow-y-auto rounded-lg border border-border/30 bg-bg-primary/80">
                        {#each displayedModels as model (model.id)}
                          <button
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-bg-hover transition-colors
                              {model.id === $settings.aiModel ? 'bg-accent/8 text-accent' : 'text-text-primary'}"
                            onclick={() => selectModel(model.id)}
                          >
                            <!-- Favorite star -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <span
                              class="shrink-0 cursor-pointer text-[16px] {isFavorite(model.id) ? 'text-yellow-400' : 'text-text-muted/30 hover:text-yellow-400/50'}"
                              onclick={(e) => { e.stopPropagation(); toggleFavorite(model.id); }}
                            >&#9733;</span>
                            <span class="truncate flex-1 font-mono text-[13px]">{model.id}</span>
                            {#if model.context_length}
                              <span class="shrink-0 text-text-muted text-[12px]">{Math.round(model.context_length / 1000)}k</span>
                            {/if}
                          </button>
                        {/each}
                        {#if displayedModels.length === 0}
                          <div class="px-4 py-4 text-text-muted text-[13px] text-center">
                            {#if isSearching}
                              No models match "{modelSearch}"
                            {:else if modelView === 'new'}
                              No models added in the last 30 days
                            {:else}
                              No models found
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {:else if !activeApiKey() && $settings.aiProvider !== "anthropic" && $settings.aiProvider !== "lmstudio"}
                    <div class="text-text-muted text-[13px]">Add your API key above, then click Load Models</div>
                  {/if}

                  <!-- Favorites -->
                  {#if $settings.aiFavoriteModels.length > 0}
                    <div class="mt-4">
                      <div class="text-text-muted text-[11px] uppercase tracking-wider mb-2">Favorites</div>
                      <div class="flex flex-wrap gap-2">
                        {#each $settings.aiFavoriteModels as fav}
                          <button
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border transition-colors
                              {fav === $settings.aiModel
                                ? 'bg-accent/10 border-accent/25 text-accent'
                                : 'bg-bg-primary border-border/30 text-text-secondary hover:border-accent/25 hover:text-accent'}"
                            onclick={() => updateSetting("aiModel", fav)}
                          >
                            <span class="font-mono">{fav.split('/').pop()}</span>
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <span
                              class="text-text-muted/40 hover:text-red-400 transition-colors ml-1 text-[15px] leading-none"
                              onclick={(e) => { e.stopPropagation(); toggleFavorite(fav); }}
                            >&times;</span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Generation settings card -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <!-- Temperature -->
                <div class="py-6 px-7">
                  <div class="flex justify-between items-center">
                    <div>
                      <div class="text-text-primary text-[13.5px] font-medium">Temperature</div>
                      <div class="text-text-muted text-[12px] mt-1">0 = deterministic, 2 = creative</div>
                    </div>
                    <div class="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={$settings.aiTemperature}
                        oninput={(e) => updateSetting("aiTemperature", Number(e.currentTarget.value))}
                        class="w-28 accent-[var(--color-accent)]"
                      />
                      <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[2.5rem] text-center font-mono">{$settings.aiTemperature}</span>
                    </div>
                  </div>
                </div>

                <!-- Max Output Tokens -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px] font-medium">Max Output Tokens</div>
                    <div class="text-text-muted text-[12px] mt-1">Maximum response length</div>
                  </div>
                  <select
                    class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                    value={$settings.aiMaxTokens}
                    onchange={(e) => updateSetting("aiMaxTokens", Number(e.currentTarget.value))}
                  >
                    <option value={4096}>4,096</option>
                    <option value={8192}>8,192</option>
                    <option value={16384}>16,384</option>
                    <option value={32768}>32,768</option>
                    <option value={65536}>65,536</option>
                    <option value={128000}>128,000</option>
                    <option value={200000}>200,000</option>
                  </select>
                </div>
              </div>

              <!-- Capabilities card -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <!-- Enable Tool Use -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Enable Tool Use</div>
                    <div class="text-text-muted text-[12px] mt-1">Read/write files, run commands</div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiEnableToolUse ? 'bg-accent' : 'bg-bg-active'}"
                    onclick={() => updateSetting("aiEnableToolUse", !$settings.aiEnableToolUse)}
                  >
                    <div
                      class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiEnableToolUse ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                    ></div>
                  </div>
                </div>

                <!-- YOLO Mode -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">YOLO Mode (No Confirmations)</div>
                    <div class="text-text-muted text-[12px] mt-1">Allow MCP, shell, and write tools without approval prompts</div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiYoloMode ? 'bg-accent' : 'bg-bg-active'}"
                    onclick={() => updateSetting("aiYoloMode", !$settings.aiYoloMode)}
                  >
                    <div
                      class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiYoloMode ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                    ></div>
                  </div>
                </div>

                <!-- Confirm Writes -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Confirm Writes</div>
                    <div class="text-text-muted text-[12px] mt-1">Ask before destructive actions</div>
                  </div>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiConfirmWrites ? 'bg-accent' : 'bg-bg-active'} {$settings.aiYoloMode ? 'opacity-40 pointer-events-none' : ''}"
                    onclick={() => updateSetting("aiConfirmWrites", !$settings.aiConfirmWrites)}
                  >
                    <div
                      class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiConfirmWrites ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                    ></div>
                  </div>
                </div>

                <!-- Max Tool Iterations -->
                <div class="flex justify-between items-center py-6 px-7">
                  <div>
                    <div class="text-text-primary text-[13.5px]">Max Tool Iterations</div>
                    <div class="text-text-muted text-[12px] mt-1">Maximum tool use loops per message</div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 w-[100px] text-center font-mono transition-colors"
                    value={$settings.aiMaxToolIterations}
                    oninput={(e) => updateSetting("aiMaxToolIterations", Number(e.currentTarget.value))}
                  />
                </div>
              </div>

              <!-- MCP servers card -->
              <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
                <div class="py-6 px-7 space-y-4">
                  <div>
                    <div class="text-text-primary text-[13.5px] font-medium">Remote MCP Servers (HTTP)</div>
                    <div class="text-text-muted text-[12px] mt-1">Link HTTP MCP servers and expose their tools to AI chat.</div>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      class="bg-bg-primary border border-border/40 rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-accent/40"
                      placeholder="Server name"
                      bind:value={newMcpName}
                    />
                    <input
                      type="text"
                      class="bg-bg-primary border border-border/40 rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-accent/40 font-mono"
                      placeholder="https://mcp.example.com"
                      bind:value={newMcpUrl}
                    />
                    <input
                      type="password"
                      class="bg-bg-primary border border-border/40 rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-accent/40"
                      placeholder="Bearer token (optional)"
                      bind:value={newMcpToken}
                    />
                    <input
                      type="number"
                      min="1000"
                      max="120000"
                      class="bg-bg-primary border border-border/40 rounded-lg px-3 py-2 text-text-primary text-[13px] outline-none focus:border-accent/40"
                      placeholder="Timeout ms"
                      bind:value={newMcpTimeoutMs}
                    />
                  </div>

                  <textarea
                    class="w-full bg-bg-primary border border-border/40 rounded-lg px-3 py-2 text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
                    rows="2"
                    placeholder="Headers JSON (optional)"
                    bind:value={newMcpHeaders}
                  ></textarea>

                  <button
                    class="px-3 py-2 text-[12px] rounded-md bg-accent/20 border border-accent/30 text-accent hover:bg-accent/25 transition-colors"
                    onclick={addMcpServer}
                  >
                    Add MCP Server
                  </button>
                </div>

                {#if $settings.mcpServers.length > 0}
                  <div class="py-4 px-7 space-y-3">
                    {#each $settings.mcpServers as server (server.id)}
                      <div class="rounded-lg border border-border/30 bg-bg-primary/45 p-3.5">
                        <div class="flex items-center gap-2">
                          <input
                            type="text"
                            class="flex-1 bg-transparent border border-border/30 rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent/40"
                            value={server.name}
                            oninput={(e) => updateMcpServer(server.id, { name: e.currentTarget.value })}
                          />
                          <button
                            class="px-2 py-1 text-[11px] rounded border border-border/40 text-text-muted hover:text-text-primary"
                            onclick={() => updateMcpServer(server.id, { enabled: !server.enabled })}
                          >
                            {server.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            class="px-2 py-1 text-[11px] rounded border border-border/40 text-text-muted hover:text-error"
                            onclick={() => removeMcpServer(server.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          type="text"
                          class="w-full mt-2 bg-transparent border border-border/30 rounded-md px-2 py-1 text-[12px] text-text-secondary font-mono outline-none focus:border-accent/40"
                          value={server.url}
                          oninput={(e) => updateMcpServer(server.id, { url: e.currentTarget.value })}
                        />

                        <div class="grid grid-cols-2 gap-2 mt-2">
                          <input
                            type="password"
                            class="bg-transparent border border-border/30 rounded-md px-2 py-1 text-[12px] text-text-secondary outline-none focus:border-accent/40"
                            placeholder="Bearer token"
                            value={server.authToken}
                            oninput={(e) => updateMcpServer(server.id, { authToken: e.currentTarget.value })}
                          />
                          <input
                            type="number"
                            min="1000"
                            max="120000"
                            class="bg-transparent border border-border/30 rounded-md px-2 py-1 text-[12px] text-text-secondary outline-none focus:border-accent/40"
                            value={server.timeoutMs}
                            oninput={(e) => updateMcpServer(server.id, { timeoutMs: Number(e.currentTarget.value) || 20000 })}
                          />
                        </div>

                        <textarea
                          class="w-full mt-2 bg-transparent border border-border/30 rounded-md px-2 py-1 text-[11px] text-text-secondary font-mono outline-none focus:border-accent/40"
                          rows="2"
                          placeholder="Headers JSON (optional)"
                          value={server.headersJson}
                          oninput={(e) => updateMcpServer(server.id, { headersJson: e.currentTarget.value })}
                        ></textarea>

                        <div class="mt-2 flex items-center gap-2">
                          <button
                            class="px-2 py-1 text-[11px] rounded border border-border/40 text-text-muted hover:text-text-primary disabled:opacity-50"
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
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-5 px-8 py-4 border-t border-border/40 text-[13px] text-text-muted">
        <span><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border/40 text-text-secondary text-[12px]">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-panel {
    font-size: calc(16px * var(--ui-zoom));
  }

  .settings-panel :global(h2) {
    font-size: calc(26px * var(--ui-zoom));
    letter-spacing: 0.01em;
  }

  .settings-panel :global(h3) {
    font-size: calc(24px * var(--ui-zoom));
    letter-spacing: 0.01em;
  }

  .settings-panel :global(input),
  .settings-panel :global(select),
  .settings-panel :global(textarea),
  .settings-panel :global(button) {
    font-size: calc(15px * var(--ui-zoom));
  }

  /* ── Spacing overrides (Tailwind 4 JIT doesn't generate these) ── */
  .settings-panel :global(.py-6) {
    padding-top: 1.9rem;
    padding-bottom: 1.9rem;
  }

  .settings-panel :global(.px-7) {
    padding-left: 2.15rem;
    padding-right: 2.15rem;
  }

  .settings-panel :global(.px-8) {
    padding-left: 2.35rem;
    padding-right: 2.35rem;
  }

  .settings-panel :global(.py-5) {
    padding-top: 1.55rem;
    padding-bottom: 1.55rem;
  }

  .settings-panel :global(.px-10) {
    padding-left: 2.5rem;
    padding-right: 2.5rem;
  }

  .settings-panel :global(.py-8) {
    padding-top: 2rem;
    padding-bottom: 2rem;
  }

  .settings-panel :global(.py-4) {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .settings-panel :global(.px-4) {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .settings-panel :global(.py-2) {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .settings-panel :global(.px-2) {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .settings-panel :global(.py-1) {
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
  }

  .settings-panel :global(.py-3) {
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
  }

  .settings-panel :global(.mx-3) {
    margin-left: 0.75rem;
    margin-right: 0.75rem;
  }

  .settings-panel :global(.mb-8) {
    margin-bottom: 2rem;
  }

  .settings-panel :global(.mb-3) {
    margin-bottom: 0.75rem;
  }

  .settings-panel :global(.mt-1) {
    margin-top: 0.25rem;
  }

  .settings-panel :global(.mt-2) {
    margin-top: 0.5rem;
  }

  .settings-panel :global(.mt-4) {
    margin-top: 1rem;
  }

  .settings-panel :global(.mb-1) {
    margin-bottom: 0.25rem;
  }

  .settings-panel :global(.mb-2) {
    margin-bottom: 0.5rem;
  }

  .settings-panel :global(.mb-4) {
    margin-bottom: 1rem;
  }

  .settings-panel :global(.ml-1) {
    margin-left: 0.25rem;
  }

  .settings-panel :global(.px-1) {
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }

  .settings-panel :global(.px-3) {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .settings-panel :global(.pl-10) {
    padding-left: 2.5rem;
  }

  .settings-panel :global(.p-3) {
    padding: 0.75rem;
  }

  /* Fractional spacing classes */
  .settings-panel :global(.gap-1) {
    gap: 0.25rem;
  }

  .settings-panel :global(.gap-1\.5) {
    gap: 0.375rem;
  }

  .settings-panel :global(.gap-2) {
    gap: 0.5rem;
  }

  .settings-panel :global(.gap-3) {
    gap: 0.75rem;
  }

  .settings-panel :global(.gap-3\.5) {
    gap: 0.875rem;
  }

  .settings-panel :global(.gap-4) {
    gap: 1rem;
  }

  .settings-panel :global(.gap-5) {
    gap: 1.25rem;
  }

  .settings-panel :global(.py-1\.5) {
    padding-top: 0.375rem;
    padding-bottom: 0.375rem;
  }

  .settings-panel :global(.py-2\.5) {
    padding-top: 0.625rem;
    padding-bottom: 0.625rem;
  }

  .settings-panel :global(.py-3\.5) {
    padding-top: 0.875rem;
    padding-bottom: 0.875rem;
  }

  .settings-panel :global(.px-2\.5) {
    padding-left: 0.625rem;
    padding-right: 0.625rem;
  }

  .settings-panel :global(.p-2\.5) {
    padding: 0.625rem;
  }

  .settings-panel :global(.p-3\.5) {
    padding: 0.875rem;
  }

  .settings-panel :global(.mt-1\.5) {
    margin-top: 0.375rem;
  }

  .settings-panel :global(.mb-1\.5) {
    margin-bottom: 0.375rem;
  }

  .settings-panel :global(.pb-0\.5) {
    padding-bottom: 0.125rem;
  }

  .settings-panel :global(.pt-5) {
    padding-top: 1.25rem;
  }

  .settings-panel :global(.text-\[13\.5px\]),
  .settings-panel :global(.text-\[13px\]),
  .settings-panel :global(.text-\[12px\]),
  .settings-panel :global(.text-\[11px\]) {
    font-size: calc(15px * var(--ui-zoom));
    line-height: 1.45;
  }

  .settings-panel :global(.text-\[16px\]) {
    font-size: calc(20px * var(--ui-zoom));
  }
</style>
