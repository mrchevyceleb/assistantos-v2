<script lang="ts">
  import { settings, updateSetting, getActiveAIKey, getActiveAIBaseUrl, inferProviderForModel } from '$lib/stores/settings';
  import type { AppSettings } from '$lib/stores/settings';
  import {
    availableModels, modelsLoading, modelsError, fetchModels,
    ANTHROPIC_MODELS, OPENAI_MODELS,
    lmStudioStatus, lmStudioModels, lmStudioError, fetchLMStudioModels,
    inferContextLength,
  } from '$lib/stores/models';
  import type { OpenRouterModel } from '$lib/stores/models';
  import { startOpenRouterOAuth, exchangeOpenRouterOAuthCode } from '$lib/utils/oauth';

  let openRouterSearch = $state('');
  let showApiKey = $state<Record<string, boolean>>({});
  let oauthCode = $state('');
  let oauthBusy = $state(false);
  let oauthStatus = $state('');

  // OpenRouter models (fetched)
  let openRouterModels = $derived(
    $availableModels.filter(m => !ANTHROPIC_MODELS.some(a => a.id === m.id) && !OPENAI_MODELS.some(o => o.id === m.id))
  );

  let filteredOpenRouterModels = $derived(
    openRouterSearch
      ? openRouterModels.filter(m =>
          m.id.toLowerCase().includes(openRouterSearch.toLowerCase()) ||
          m.name.toLowerCase().includes(openRouterSearch.toLowerCase())
        )
      : openRouterModels.slice(0, 50)
  );

  function isEnabled(modelId: string): boolean {
    return $settings.aiEnabledModels.includes(modelId);
  }

  function isFavorite(modelId: string): boolean {
    return $settings.aiFavoriteModels.includes(modelId);
  }

  function isDefault(modelId: string): boolean {
    return $settings.aiModel === modelId;
  }

  function toggleEnabled(modelId: string) {
    const enabled = [...$settings.aiEnabledModels];
    const idx = enabled.indexOf(modelId);
    if (idx >= 0) {
      enabled.splice(idx, 1);
      // Also remove from favorites if disabling
      const favs = $settings.aiFavoriteModels.filter(f => f !== modelId);
      updateSetting('aiFavoriteModels', favs);
    } else {
      enabled.push(modelId);
    }
    updateSetting('aiEnabledModels', enabled);
  }

  function toggleFavorite(modelId: string) {
    const favs = [...$settings.aiFavoriteModels];
    const idx = favs.indexOf(modelId);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push(modelId);
      // Also enable if not already
      if (!isEnabled(modelId)) {
        updateSetting('aiEnabledModels', [...$settings.aiEnabledModels, modelId]);
      }
    }
    updateSetting('aiFavoriteModels', favs);
  }

  function setDefault(modelId: string) {
    updateSetting('aiModel', modelId);
    // Also enable and favorite if not already
    if (!isEnabled(modelId)) {
      updateSetting('aiEnabledModels', [...$settings.aiEnabledModels, modelId]);
    }
    if (!isFavorite(modelId)) {
      updateSetting('aiFavoriteModels', [...$settings.aiFavoriteModels, modelId]);
    }
  }

  function formatContext(len: number | undefined): string {
    if (!len) return '';
    return `${Math.round(len / 1000)}k`;
  }

  function toggleShowKey(provider: string) {
    showApiKey = { ...showApiKey, [provider]: !showApiKey[provider] };
  }

  async function handleOAuthStart() {
    if (oauthBusy) return;
    oauthBusy = true;
    oauthStatus = '';
    try {
      oauthStatus = await startOpenRouterOAuth();
    } catch (e) {
      oauthStatus = `OAuth start failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      oauthBusy = false;
    }
  }

  async function handleOAuthExchange() {
    if (oauthBusy || !oauthCode.trim()) return;
    oauthBusy = true;
    oauthStatus = 'Exchanging code...';
    try {
      oauthStatus = await exchangeOpenRouterOAuthCode(oauthCode);
      oauthCode = '';
    } catch (e) {
      oauthStatus = `OAuth exchange failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      oauthBusy = false;
    }
  }

  async function handleLMStudioConnect() {
    await fetchLMStudioModels($settings.aiLMStudioBaseUrl);
  }
</script>

<div style="display: flex; flex-direction: column; gap: 24px;">

  <!-- Favorites (quick access) -->
  {#if $settings.aiFavoriteModels.length > 0}
    <div class="rounded-xl bg-bg-secondary/40 border border-accent/20 overflow-hidden">
      <div style="padding: 12px 20px; border-bottom: 1px solid rgba(var(--border-rgb, 255, 255, 255), 0.1); background: rgba(var(--bg-secondary-rgb, 0, 0, 0), 0.2);">
        <div class="flex items-center" style="gap: 8px;">
          <span class="text-yellow-400 text-[14px]">&#9733;</span>
          <div class="text-text-primary text-[14px] font-semibold">Favorites</div>
          <span class="text-text-muted text-[11px]">({$settings.aiFavoriteModels.length})</span>
        </div>
      </div>
      <div class="divide-y divide-border/15">
        {#each $settings.aiFavoriteModels as modelId (modelId)}
          {@const modelInfo = $availableModels.find(m => m.id === modelId)}
          {@const ctxLen = modelInfo?.context_length || inferContextLength(modelId)}
          <div class="model-row">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="w-[38px] h-[22px] rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(modelId) ? 'bg-accent' : 'bg-bg-active'}"
              onclick={() => toggleEnabled(modelId)}
              title={isEnabled(modelId) ? 'Disable model' : 'Enable model'}
            >
              <div class="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform {isEnabled(modelId) ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></div>
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="shrink-0 cursor-pointer text-[16px] text-yellow-400 hover:text-yellow-400/50"
              onclick={() => toggleFavorite(modelId)}
              title="Remove from favorites"
            >&#9733;</span>
            <div class="flex-1 min-w-0 truncate">
              <span class="text-text-primary text-[13px] font-mono">{modelId}</span>
              {#if ctxLen}
                <span class="text-text-muted text-[11px]" style="margin-left: 8px;">{formatContext(ctxLen)}</span>
              {/if}
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">({inferProviderForModel(modelId, $settings.aiProvider)})</span>
            </div>
            {#if isDefault(modelId)}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {:else}
              <button
                class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
                style="padding: 2px 8px;"
                onclick={() => setDefault(modelId)}
              >Set Default</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Anthropic -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
    <div class="provider-header">
      <div class="flex items-center" style="gap: 12px;">
        <div class="text-text-primary text-[14px] font-semibold">Anthropic</div>
        <div class="flex items-center" style="gap: 6px; flex: 1;">
          <input
            type={showApiKey['anthropic'] ? 'text' : 'password'}
            class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
            style="padding: 6px 10px;"
            placeholder="sk-ant-..."
            value={$settings.aiAnthropicApiKey}
            oninput={(e) => updateSetting('aiAnthropicApiKey', e.currentTarget.value)}
          />
          <button
            class="text-text-muted hover:text-text-primary text-[11px] shrink-0"
            style="padding: 4px 6px;"
            onclick={() => toggleShowKey('anthropic')}
          >{showApiKey['anthropic'] ? 'Hide' : 'Show'}</button>
        </div>
      </div>
    </div>
    <div class="divide-y divide-border/15">
      {#each ANTHROPIC_MODELS as model (model.id)}
        {@const fullId = `anthropic/${model.id}`}
        <div class="model-row">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="w-[38px] h-[22px] rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(fullId) ? 'bg-accent' : 'bg-bg-active'}"
            onclick={() => toggleEnabled(fullId)}
          >
            <div class="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform {isEnabled(fullId) ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></div>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="shrink-0 cursor-pointer text-[16px] {isFavorite(fullId) ? 'text-yellow-400' : 'text-text-muted/30 hover:text-yellow-400/50'}"
            onclick={() => toggleFavorite(fullId)}
          >&#9733;</span>
          <div class="flex-1 min-w-0">
            <span class="text-text-primary text-[13px] font-medium">{model.name}</span>
            {#if model.context_length}
              <span class="text-text-muted text-[11px]" style="margin-left: 8px;">{formatContext(model.context_length)}</span>
            {/if}
            <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">(Anthropic)</span>
          </div>
          {#if isDefault(fullId)}
            <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
          {:else if isEnabled(fullId)}
            <button
              class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
              style="padding: 2px 8px;"
              onclick={() => setDefault(fullId)}
            >Set Default</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- OpenRouter -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
    <div class="provider-header">
      <div class="flex items-center" style="gap: 12px;">
        <div class="text-text-primary text-[14px] font-semibold">OpenRouter</div>
        <div class="flex items-center" style="gap: 6px; flex: 1;">
          <input
            type={showApiKey['openrouter'] ? 'text' : 'password'}
            class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
            style="padding: 6px 10px;"
            placeholder="sk-or-..."
            value={$settings.aiOpenRouterApiKey}
            oninput={(e) => {
              updateSetting('aiOpenRouterApiKey', e.currentTarget.value);
              updateSetting('aiApiKey', e.currentTarget.value);
            }}
          />
          <button
            class="text-text-muted hover:text-text-primary text-[11px] shrink-0"
            style="padding: 4px 6px;"
            onclick={() => toggleShowKey('openrouter')}
          >{showApiKey['openrouter'] ? 'Hide' : 'Show'}</button>
          <button
            class="text-accent hover:bg-accent/10 rounded text-[11px] shrink-0 border border-accent/30 disabled:opacity-50"
            style="padding: 4px 8px;"
            onclick={() => fetchModels()}
            disabled={$modelsLoading || !$settings.aiOpenRouterApiKey.trim()}
          >{$modelsLoading ? 'Loading...' : 'Refresh Models'}</button>
        </div>
      </div>
      <div class="flex items-center" style="gap: 8px; margin-top: 10px;">
        <button
          class="text-[11px] border border-border/40 rounded px-2 py-1 hover:border-accent/40 disabled:opacity-50"
          onclick={handleOAuthStart}
          disabled={oauthBusy}
        >{oauthBusy ? 'Working…' : 'OpenRouter OAuth: Start'}</button>
        <input
          type="text"
          class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[11px] font-mono outline-none focus:border-accent/40"
          style="padding: 4px 8px;"
          placeholder="Paste OAuth callback code here"
          value={oauthCode}
          oninput={(e) => (oauthCode = e.currentTarget.value)}
        />
        <button
          class="text-[11px] border border-border/40 rounded px-2 py-1 hover:border-accent/40 disabled:opacity-50"
          onclick={handleOAuthExchange}
          disabled={oauthBusy || !oauthCode.trim()}
        >Exchange</button>
      </div>
      {#if oauthStatus}
        <div class="text-[11px] text-text-muted" style="margin-top: 6px;">{oauthStatus}</div>
      {/if}
      {#if $modelsError}
        <div class="text-red-400 text-[11px]" style="margin-top: 6px;">{$modelsError}</div>
      {/if}
    </div>

    <div class="px-5 py-3 border-b border-border/10">
      <input
        type="text"
        class="w-full bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] outline-none focus:border-accent/40"
        style="padding: 7px 10px;"
        placeholder="Search OpenRouter models (name or id)"
        bind:value={openRouterSearch}
      />
    </div>

    <div class="divide-y divide-border/15" style="max-height: 360px; overflow: auto;">
      {#if filteredOpenRouterModels.length === 0}
        <div class="text-text-muted text-[12px] text-center" style="padding: 16px;">No models found. Click "Refresh Models" above.</div>
      {:else}
        {#each filteredOpenRouterModels as model (model.id)}
          <div class="model-row">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="w-[38px] h-[22px] rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(model.id) ? 'bg-accent' : 'bg-bg-active'}"
              onclick={() => toggleEnabled(model.id)}
            >
              <div class="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform {isEnabled(model.id) ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></div>
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="shrink-0 cursor-pointer text-[16px] {isFavorite(model.id) ? 'text-yellow-400' : 'text-text-muted/30 hover:text-yellow-400/50'}"
              onclick={() => toggleFavorite(model.id)}
            >&#9733;</span>
            <div class="flex-1 min-w-0 truncate">
              <span class="text-text-primary text-[13px] font-mono">{model.id}</span>
              {#if model.context_length}
                <span class="text-text-muted text-[11px]" style="margin-left: 8px;">{formatContext(model.context_length)}</span>
              {/if}
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">(OpenRouter)</span>
            </div>
            {#if isDefault(model.id)}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {:else if isEnabled(model.id)}
              <button
                class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
                style="padding: 2px 8px;"
                onclick={() => setDefault(model.id)}
              >Set Default</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- OpenAI -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
    <div class="provider-header">
      <div class="flex items-center" style="gap: 12px;">
        <div class="text-text-primary text-[14px] font-semibold">OpenAI</div>
        <div class="flex items-center" style="gap: 6px; flex: 1;">
          <input
            type={showApiKey['openai'] ? 'text' : 'password'}
            class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
            style="padding: 6px 10px;"
            placeholder="sk-..."
            value={$settings.aiOpenAIApiKey}
            oninput={(e) => updateSetting('aiOpenAIApiKey', e.currentTarget.value)}
          />
          <button
            class="text-text-muted hover:text-text-primary text-[11px] shrink-0"
            style="padding: 4px 6px;"
            onclick={() => toggleShowKey('openai')}
          >{showApiKey['openai'] ? 'Hide' : 'Show'}</button>
        </div>
      </div>
    </div>
    <div class="divide-y divide-border/15">
      {#each OPENAI_MODELS as model (model.id)}
        {@const fullId = `openai/${model.id}`}
        <div class="model-row">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="w-[38px] h-[22px] rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(fullId) ? 'bg-accent' : 'bg-bg-active'}"
            onclick={() => toggleEnabled(fullId)}
          >
            <div class="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform {isEnabled(fullId) ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></div>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="shrink-0 cursor-pointer text-[16px] {isFavorite(fullId) ? 'text-yellow-400' : 'text-text-muted/30 hover:text-yellow-400/50'}"
            onclick={() => toggleFavorite(fullId)}
          >&#9733;</span>
          <div class="flex-1 min-w-0">
            <span class="text-text-primary text-[13px] font-medium">{model.name}</span>
            {#if model.context_length}
              <span class="text-text-muted text-[11px]" style="margin-left: 8px;">{formatContext(model.context_length)}</span>
            {/if}
            <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">(OpenAI)</span>
          </div>
          {#if isDefault(fullId)}
            <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
          {:else if isEnabled(fullId)}
            <button
              class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
              style="padding: 2px 8px;"
              onclick={() => setDefault(fullId)}
            >Set Default</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- LM Studio -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
    <div class="provider-header">
      <div class="flex items-center" style="gap: 12px;">
        <div class="text-text-primary text-[14px] font-semibold">LM Studio</div>
        <div class="flex items-center" style="gap: 6px; flex: 1;">
          <input
            type="text"
            class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] font-mono outline-none focus:border-accent/40"
            style="padding: 6px 10px;"
            placeholder="http://localhost:1234/v1"
            value={$settings.aiLMStudioBaseUrl}
            oninput={(e) => updateSetting('aiLMStudioBaseUrl', e.currentTarget.value)}
          />
          <button
            class="text-accent hover:bg-accent/10 rounded text-[11px] shrink-0 border border-accent/30 disabled:opacity-50"
            style="padding: 4px 8px;"
            onclick={handleLMStudioConnect}
            disabled={$lmStudioStatus === 'checking'}
          >
            {$lmStudioStatus === 'checking' ? 'Connecting...' : $lmStudioStatus === 'connected' ? 'Refresh' : 'Connect'}
          </button>
          {#if $lmStudioStatus === 'connected'}
            <span class="text-green-400 text-[11px]">Connected</span>
          {:else if $lmStudioStatus === 'disconnected'}
            <span class="text-text-muted text-[11px]">Disconnected</span>
          {/if}
        </div>
      </div>
      {#if $lmStudioError}
        <div class="text-red-400 text-[11px]" style="margin-top: 8px;">{$lmStudioError}</div>
      {/if}
    </div>
    {#if $lmStudioModels.length > 0}
      <div class="divide-y divide-border/15">
        {#each $lmStudioModels as model (model.id)}
          <div class="model-row">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="w-[38px] h-[22px] rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(model.id) ? 'bg-accent' : 'bg-bg-active'}"
              onclick={() => toggleEnabled(model.id)}
            >
              <div class="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform {isEnabled(model.id) ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></div>
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="shrink-0 cursor-pointer text-[16px] {isFavorite(model.id) ? 'text-yellow-400' : 'text-text-muted/30 hover:text-yellow-400/50'}"
              onclick={() => toggleFavorite(model.id)}
            >&#9733;</span>
            <div class="flex-1 min-w-0 truncate">
              <span class="text-text-primary text-[13px] font-mono">{model.id}</span>
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">(LM Studio)</span>
            </div>
            {#if isDefault(model.id)}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {:else if isEnabled(model.id)}
              <button
                class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
                style="padding: 2px 8px;"
                onclick={() => setDefault(model.id)}
              >Set Default</button>
            {/if}
          </div>
        {/each}
      </div>
    {:else if $lmStudioStatus === 'disconnected'}
      <div class="text-text-muted text-[12px] text-center" style="padding: 16px;">Click Connect to detect local models</div>
    {/if}
  </div>
</div>

<style>
  .provider-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(var(--border-rgb, 255, 255, 255), 0.1);
    background: rgba(var(--bg-secondary-rgb, 0, 0, 0), 0.2);
  }

  .model-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
  }

  .model-row:hover {
    background: rgba(var(--bg-hover-rgb, 255, 255, 255), 0.03);
  }
</style>

