<script lang="ts">
  import { settings, updateSetting } from "$lib/stores/settings";
  import type { AppSettings } from "$lib/stores/settings";
  import { uiZoom, applyZoom } from "$lib/stores/ui";
  import { availableModels, modelsLoading, modelsError, fetchModels, modelsLastFetched, TOP_PROVIDERS } from "$lib/stores/models";
  import type { OpenRouterModel } from "$lib/stores/models";

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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
  >
    <div class="w-[960px] max-h-[88vh] min-h-[560px] glass-panel-solid border border-border rounded-2xl shadow-2xl glow-border flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-9 py-6 border-b border-border/60">
        <h2 class="text-text-primary text-lg font-semibold tracking-wide">Settings</h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          onclick={onClose}
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
        <div class="w-[240px] border-r border-border/60 py-4 shrink-0 flex flex-col">
          {#each categories as cat}
            <button
              class="w-full flex items-center gap-3.5 px-6 flex-1 text-[14px] text-left transition-colors
                {activeCategory === cat ? 'bg-bg-hover text-text-primary border-l-2 border-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary border-l-2 border-transparent'}"
              onclick={() => activeCategory = cat}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                <path d={categoryIcons[cat]}/>
              </svg>
              {cat}
            </button>
          {/each}
        </div>

        <!-- Right content -->
        <div class="flex-1 overflow-y-auto px-10 py-7 flex flex-col">
          {#if activeCategory === "Terminal"}
            <div class="flex-1 flex flex-col">
            <!-- Default dock position -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Default dock position</div>
                <div class="text-text-muted text-[12.5px] mt-1">Where new terminals open</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50"
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
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Default shell</div>
                <div class="text-text-muted text-[12.5px] mt-1">Shell used for new terminals</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50"
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
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Font size</div>
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
                <span class="text-[13px] text-text-primary bg-bg-secondary px-2.5 py-1 rounded-md min-w-[2rem] text-center">{$settings.terminalFontSize}</span>
              </div>
            </div>

            <!-- Cursor style -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Cursor style</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50"
                value={$settings.terminalCursorStyle}
                onchange={(e) => updateSetting("terminalCursorStyle", e.currentTarget.value as AppSettings["terminalCursorStyle"])}
              >
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </select>
            </div>
            </div>

          {:else if activeCategory === "Editor"}
            <div class="flex-1 flex flex-col">
            <!-- Editor font size -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Font size</div>
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
                <span class="text-[13px] text-text-primary bg-bg-secondary px-2.5 py-1 rounded-md min-w-[2rem] text-center">{$settings.editorFontSize}</span>
              </div>
            </div>

            <!-- Tab size -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Tab size</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50"
                value={$settings.tabSize}
                onchange={(e) => updateSetting("tabSize", Number(e.currentTarget.value))}
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </div>

            <!-- Word wrap -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Word wrap</div>
                <div class="text-text-muted text-[12.5px] mt-1">Wrap long lines in the editor</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.wordWrap ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("wordWrap", !$settings.wordWrap)}
              >
                <div
                  class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.wordWrap ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>

            <!-- Auto-save delay -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Auto-save delay</div>
                <div class="text-text-muted text-[12.5px] mt-1">Delay before auto-saving changes</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50"
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
            <div class="flex-1 flex flex-col">
            <!-- UI Zoom -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">UI Zoom</div>
                <div class="text-text-muted text-[12.5px] mt-1">Scale the entire interface</div>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min="60"
                  max="200"
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
                <span class="text-[13px] text-text-primary bg-bg-secondary px-2.5 py-1 rounded-md min-w-[2.5rem] text-center">{Math.round($uiZoom * 100)}%</span>
              </div>
            </div>

            <!-- Theme -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Theme</div>
                <div class="text-text-muted text-[12.5px] mt-1">More themes coming soon</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2 text-text-primary text-[14px] outline-none focus:border-accent/50 opacity-60 cursor-not-allowed"
                value={$settings.theme}
                disabled
              >
                <option value="catppuccin-mocha">Liquid Metal</option>
              </select>
            </div>
            </div>

          {:else if activeCategory === "File Explorer"}
            <div class="flex-1 flex flex-col">
            <!-- Show hidden files -->
            <div class="flex justify-between items-center flex-1 max-h-[120px] px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Show hidden files</div>
                <div class="text-text-muted text-[12.5px] mt-1">Display files starting with a dot</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.showHiddenFiles ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("showHiddenFiles", !$settings.showHiddenFiles)}
              >
                <div
                  class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.showHiddenFiles ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>
            </div>

          {:else if activeCategory === "General"}
            <div class="flex-1 flex flex-col">
            <!-- Restore session -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Restore session on startup</div>
                <div class="text-text-muted text-[12.5px] mt-1">Re-open previous tabs and terminals</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.restoreSession ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("restoreSession", !$settings.restoreSession)}
              >
                <div
                  class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.restoreSession ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>

            <!-- Confirm close unsaved -->
            <div class="flex justify-between items-center flex-1 px-1 border-b border-border/30">
              <div>
                <div class="text-text-primary text-[14px]">Confirm before closing unsaved tabs</div>
                <div class="text-text-muted text-[12.5px] mt-1">Show a warning when closing tabs with unsaved changes</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.confirmCloseUnsaved ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("confirmCloseUnsaved", !$settings.confirmCloseUnsaved)}
              >
                <div
                  class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.confirmCloseUnsaved ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>
            </div>

          {:else if activeCategory === "AI Chat"}
            <div class="space-y-6">

            <!-- OpenRouter API Key -->
            <div class="px-1">
              <div class="text-text-primary text-[14px] font-medium mb-1">OpenRouter API Key</div>
              <div class="text-text-muted text-[13px] mb-2.5">Your OpenRouter API key for AI chat</div>
              <input
                type="password"
                class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-[14px] font-mono outline-none focus:border-accent/50"
                value={$settings.aiApiKey}
                oninput={(e) => updateSetting("aiApiKey", e.currentTarget.value)}
                placeholder="sk-or-..."
              />
            </div>

            <!-- Model Picker -->
            <div class="px-1">
              <div class="flex justify-between items-center mb-2.5">
                <div>
                  <div class="text-text-primary text-[14px] font-medium">Model</div>
                  <div class="text-text-muted text-[13px] mt-0.5">Current: <span class="text-accent font-mono">{$settings.aiModel}</span></div>
                </div>
                <button
                  class="px-4 py-2 text-[13px] rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-2
                    {$modelsLoading ? 'opacity-50 pointer-events-none' : ''}"
                  onclick={() => fetchModels()}
                  disabled={$modelsLoading || !$settings.aiApiKey}
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
                    class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-[14px] outline-none focus:border-accent/50 pl-10"
                    bind:value={modelSearch}
                    placeholder="Search {$availableModels.length} models..."
                    onfocus={() => modelDropdownOpen = true}
                  />
                  <svg class="absolute left-3 top-3 text-text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>

                <!-- Tab bar (hidden when actively searching) -->
                {#if !isSearching}
                  <div class="flex gap-1 mb-2 border-b border-border/30 pb-0.5">
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
                  <div class="max-h-[320px] overflow-y-auto rounded-lg border border-border/40 bg-bg-secondary/80">
                    {#each displayedModels as model (model.id)}
                      <button
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-bg-hover transition-colors
                          {model.id === $settings.aiModel ? 'bg-accent/10 text-accent' : 'text-text-primary'}"
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
              {:else if !$settings.aiApiKey}
                <div class="text-text-muted text-[13px]">Add your API key above, then click Load Models</div>
              {/if}

              <!-- Favorites -->
              {#if $settings.aiFavoriteModels.length > 0}
                <div class="mt-4">
                  <div class="text-text-muted text-[12px] uppercase tracking-wider mb-2">Favorites</div>
                  <div class="flex flex-wrap gap-2">
                    {#each $settings.aiFavoriteModels as fav}
                      <button
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border transition-colors
                          {fav === $settings.aiModel
                            ? 'bg-accent/15 border-accent/30 text-accent'
                            : 'bg-bg-secondary border-border/40 text-text-secondary hover:border-accent/30 hover:text-accent'}"
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

            <!-- API Base URL -->
            <div class="px-1">
              <div class="text-text-primary text-[14px] font-medium mb-1">API Base URL</div>
              <div class="text-text-muted text-[13px] mb-2.5">OpenRouter-compatible API endpoint</div>
              <input
                type="text"
                class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-[14px] font-mono outline-none focus:border-accent/50"
                value={$settings.aiBaseUrl}
                oninput={(e) => updateSetting("aiBaseUrl", e.currentTarget.value)}
              />
            </div>

            <!-- Temperature + Max Tokens row -->
            <div class="flex gap-6 px-1">
              <div class="flex-1">
                <div class="text-text-primary text-[14px] font-medium mb-1">Temperature</div>
                <div class="text-text-muted text-[13px] mb-2.5">0 = deterministic, 2 = creative</div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={$settings.aiTemperature}
                    oninput={(e) => updateSetting("aiTemperature", Number(e.currentTarget.value))}
                    class="flex-1 accent-[var(--color-accent)]"
                  />
                  <span class="text-[14px] text-text-primary bg-bg-secondary px-3 py-1.5 rounded-lg min-w-[3rem] text-center font-mono">{$settings.aiTemperature}</span>
                </div>
              </div>
              <div class="flex-1">
                <div class="text-text-primary text-[14px] font-medium mb-1">Max Output Tokens</div>
                <div class="text-text-muted text-[13px] mb-2.5">Maximum response length</div>
                <select
                  class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-[14px] outline-none focus:border-accent/50"
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

            <!-- Toggles row -->
            <div class="flex gap-6 px-1">
              <div class="flex-1 flex justify-between items-center py-3 px-4 bg-bg-secondary/50 rounded-lg border border-border/30">
                <div>
                  <div class="text-text-primary text-[14px]">Enable Tool Use</div>
                  <div class="text-text-muted text-[13px] mt-0.5">Read/write files, run commands</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 ml-4 {$settings.aiEnableToolUse ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("aiEnableToolUse", !$settings.aiEnableToolUse)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiEnableToolUse ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
              <div class="flex-1 flex justify-between items-center py-3 px-4 bg-bg-secondary/50 rounded-lg border border-border/30">
                <div>
                  <div class="text-text-primary text-[14px]">Confirm Writes</div>
                  <div class="text-text-muted text-[13px] mt-0.5">Ask before destructive actions</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[48px] h-[26px] rounded-full relative cursor-pointer transition-colors shrink-0 ml-4 {$settings.aiConfirmWrites ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("aiConfirmWrites", !$settings.aiConfirmWrites)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.aiConfirmWrites ? 'translate-x-[24px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Max Tool Iterations -->
            <div class="flex justify-between items-center px-1">
              <div>
                <div class="text-text-primary text-[14px] font-medium">Max Tool Iterations</div>
                <div class="text-text-muted text-[13px] mt-0.5">Maximum tool use loops per message</div>
              </div>
              <input
                type="number"
                min="1"
                max="50"
                class="bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary text-[14px] outline-none focus:border-accent/50 w-[120px] text-center font-mono"
                value={$settings.aiMaxToolIterations}
                oninput={(e) => updateSetting("aiMaxToolIterations", Number(e.currentTarget.value))}
              />
            </div>

            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-5 px-9 py-4 border-t border-border/60 text-[13px] text-text-muted">
        <span><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}
