<script lang="ts">
  import { settings, updateSetting } from '$lib/stores/settings';
  import {
    availableModels,
    modelsLoading,
    modelsError,
    fetchModels,
    ANTHROPIC_MODELS,
    OPENAI_MODELS,
    lmStudioStatus,
    lmStudioModels,
    lmStudioError,
    fetchLMStudioModels,
    inferContextLength,
    getModelDisplayName,
  } from '$lib/stores/models';
  import {
    startOpenRouterOAuth,
    exchangeOpenRouterOAuthCode,
    startOpenAIDeviceOAuth,
    completeOpenAIDeviceOAuth,
    cancelOpenAIDeviceOAuth,
    getPendingOpenAIDeviceOAuth,
    type OpenAIDeviceAuthState,
  } from '$lib/utils/oauth';

  let openRouterSearch = $state('');
  let showApiKey = $state<Record<string, boolean>>({});

  let openRouterOAuthCode = $state('');
  let openRouterOAuthBusy = $state(false);
  let openRouterOAuthStatus = $state('');

  let openAIDeviceBusy = $state(false);
  let openAIDeviceStatus = $state('');
  let openAIDeviceState = $state<OpenAIDeviceAuthState | null>(null);

  function getProviderLabel(modelId: string): string {
    if (modelId.startsWith('anthropic/')) return 'Anthropic';
    if (modelId.startsWith('openai/')) return 'OpenAI';
    if (modelId.startsWith('google/')) return 'Google';
    if (modelId.startsWith('mistralai/')) return 'Mistral';
    if (modelId.startsWith('deepseek/')) return 'DeepSeek';
    // LM Studio models don't have a prefix
    if (!modelId.includes('/')) return 'LM Studio';
    const prefix = modelId.split('/')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  let enabledModelsList = $derived(
    ($settings.aiEnabledModels || []).map((id) => {
      // Try to find the model object for a richer display name
      const orModel = $availableModels.find((m) => m.id === id);
      const lmsModel = $lmStudioModels.find((m) => m.id === id);
      const anthropicModel = ANTHROPIC_MODELS.find((m) => `anthropic/${m.id}` === id);
      const openaiModel = OPENAI_MODELS.find((m) => `openai/${m.id}` === id);
      const resolved = orModel || lmsModel || (anthropicModel ? { ...anthropicModel, id } : null) || (openaiModel ? { ...openaiModel, id } : null);
      return {
        id,
        name: resolved ? getModelDisplayName(resolved) : getModelDisplayName(id),
        provider: getProviderLabel(id),
        isDefault: $settings.aiModel === id,
      };
    }),
  );

  let openRouterModels = $derived(
    $availableModels.filter(
      (m) => !ANTHROPIC_MODELS.some((a) => a.id === m.id) && !OPENAI_MODELS.some((o) => o.id === m.id),
    ),
  );

  let filteredOpenRouterModels = $derived(
    openRouterSearch
      ? openRouterModels.filter(
          (m) =>
            m.id.toLowerCase().includes(openRouterSearch.toLowerCase()) ||
            (m.name || '').toLowerCase().includes(openRouterSearch.toLowerCase()),
        )
      : openRouterModels.slice(0, 120),
  );

  function isEnabled(modelId: string): boolean {
    return $settings.aiEnabledModels.includes(modelId);
  }

  function isDefault(modelId: string): boolean {
    return $settings.aiModel === modelId;
  }

  function toggleEnabled(modelId: string) {
    const enabled = [...$settings.aiEnabledModels];
    const idx = enabled.indexOf(modelId);
    if (idx >= 0) {
      enabled.splice(idx, 1);
    } else {
      enabled.push(modelId);
    }

    updateSetting('aiEnabledModels', enabled);

    if (modelId === $settings.aiModel && !enabled.includes(modelId) && enabled.length > 0) {
      updateSetting('aiModel', enabled[0]);
    }
  }

  function setDefault(modelId: string, provider: 'anthropic' | 'openrouter' | 'openai' | 'lmstudio') {
    if (!isEnabled(modelId)) {
      updateSetting('aiEnabledModels', [...$settings.aiEnabledModels, modelId]);
    }
    updateSetting('aiModel', modelId);
    updateSetting('aiProvider', provider);
  }

  function formatContext(len: number | undefined): string {
    if (!len) return '';
    return `${Math.round(len / 1000)}k`;
  }

  function toggleShowKey(provider: string) {
    showApiKey = { ...showApiKey, [provider]: !showApiKey[provider] };
  }

  async function copyToClipboard(value: string) {
    const text = (value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
  }

  async function handleOpenRouterOAuthStart() {
    if (openRouterOAuthBusy) return;
    openRouterOAuthBusy = true;
    openRouterOAuthStatus = '';
    try {
      openRouterOAuthStatus = await startOpenRouterOAuth();
    } catch (e) {
      openRouterOAuthStatus = `OAuth start failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openRouterOAuthBusy = false;
    }
  }

  async function handleOpenRouterOAuthExchange() {
    if (openRouterOAuthBusy || !openRouterOAuthCode.trim()) return;
    openRouterOAuthBusy = true;
    openRouterOAuthStatus = 'Exchanging code...';
    try {
      openRouterOAuthStatus = await exchangeOpenRouterOAuthCode(openRouterOAuthCode);
      openRouterOAuthCode = '';
    } catch (e) {
      openRouterOAuthStatus = `OAuth exchange failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openRouterOAuthBusy = false;
    }
  }

  async function handleOpenAIOAuthStart() {
    if (openAIDeviceBusy) return;
    openAIDeviceBusy = true;
    openAIDeviceStatus = '';
    try {
      openAIDeviceState = await startOpenAIDeviceOAuth();
      openAIDeviceStatus = 'Browser opened. Complete authorization, then click Complete OAuth.';
    } catch (e) {
      openAIDeviceStatus = `OAuth start failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openAIDeviceBusy = false;
    }
  }

  async function handleOpenAIOAuthComplete() {
    if (openAIDeviceBusy) return;
    openAIDeviceBusy = true;
    openAIDeviceStatus = 'Waiting for authorization...';
    try {
      openAIDeviceStatus = await completeOpenAIDeviceOAuth();
      openAIDeviceState = null;
    } catch (e) {
      openAIDeviceStatus = `OAuth completion failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      openAIDeviceBusy = false;
    }
  }

  function handleOpenAIOAuthCancel() {
    cancelOpenAIDeviceOAuth();
    openAIDeviceState = null;
    openAIDeviceStatus = 'OpenAI OAuth flow canceled.';
  }

  async function handleLMStudioConnect() {
    await fetchLMStudioModels($settings.aiLMStudioBaseUrl);
  }

  $effect(() => {
    if (!openAIDeviceState) {
      openAIDeviceState = getPendingOpenAIDeviceOAuth();
    }
  });
</script>

<div style="display: flex; flex-direction: column; gap: 24px;">
  <!-- Enabled Models Quick Toggle -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden">
    <div class="provider-header">
      <div class="flex items-center justify-between">
        <div class="text-text-primary text-[14px] font-semibold">Enabled Models</div>
        <span class="text-text-muted text-[11px]">{enabledModelsList.length} active</span>
      </div>
    </div>
    {#if enabledModelsList.length === 0}
      <div class="text-text-muted text-[12px] text-center" style="padding: 20px;">
        No models enabled. Toggle models on in the provider sections below.
      </div>
    {:else}
      <div class="divide-y divide-border/15">
        {#each enabledModelsList as model (model.id)}
          <div class="model-row enabled-model-row">
            <div
              class="rounded-full relative cursor-pointer transition-colors shrink-0 bg-accent"
              style="width: 38px; height: 22px;"
              onclick={() => toggleEnabled(model.id)}
              title="Disable {model.name}"
            >
              <div class="absolute rounded-full shadow transition-transform"
                style="top: 2px; width: 18px; height: 18px; background: #fff; transform: translateX(18px);"></div>
            </div>
            <div class="flex-1 min-w-0 flex items-center" style="gap: 8px;">
              <span class="text-text-primary text-[13px] font-medium">{model.name}</span>
              <span class="text-text-muted text-[10px] border border-border/20 rounded" style="padding: 1px 6px; opacity: 0.7;">{model.provider}</span>
            </div>
            {#if model.isDefault}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

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
          <div
            class="rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(fullId) ? 'bg-accent' : 'bg-bg-active'}"
            style="width: 38px; height: 22px; {isEnabled(fullId) ? '' : 'border: 1px solid rgba(255,255,255,0.15);'}"
            onclick={() => toggleEnabled(fullId)}
          >
            <div class="absolute rounded-full shadow transition-transform"
              style="top: 2px; width: 18px; height: 18px; background: {isEnabled(fullId) ? '#fff' : 'rgba(255,255,255,0.6)'}; transform: translateX({isEnabled(fullId) ? '18px' : '2px'});"></div>
          </div>
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
              onclick={() => setDefault(fullId, 'anthropic')}
            >Set Default</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

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
          class="text-[11px] border border-border/40 rounded hover:border-accent/40 disabled:opacity-50"
          style="padding: 4px 8px;"
          onclick={handleOpenRouterOAuthStart}
          disabled={openRouterOAuthBusy}
        >{openRouterOAuthBusy ? 'Working...' : 'OpenRouter OAuth: Start'}</button>
        <input
          type="text"
          class="flex-1 bg-bg-primary border border-border/40 rounded-md text-text-primary text-[11px] font-mono outline-none focus:border-accent/40"
          style="padding: 4px 8px;"
          placeholder="Paste OAuth callback code"
          value={openRouterOAuthCode}
          oninput={(e) => (openRouterOAuthCode = e.currentTarget.value)}
        />
        <button
          class="text-[11px] border border-border/40 rounded hover:border-accent/40 disabled:opacity-50"
          style="padding: 4px 8px;"
          onclick={handleOpenRouterOAuthExchange}
          disabled={openRouterOAuthBusy || !openRouterOAuthCode.trim()}
        >Exchange</button>
      </div>

      {#if openRouterOAuthStatus}
        <div class="text-[11px] text-text-muted" style="margin-top: 6px;">{openRouterOAuthStatus}</div>
      {/if}
      {#if $modelsError}
        <div class="text-red-400 text-[11px]" style="margin-top: 6px;">{$modelsError}</div>
      {/if}
    </div>

    <div style="padding: 12px 20px; border-bottom: 1px solid rgba(var(--border-rgb, 255, 255, 255), 0.1);">
      <input
        type="text"
        class="w-full bg-bg-primary border border-border/40 rounded-md text-text-primary text-[12px] outline-none focus:border-accent/40"
        style="padding: 7px 10px;"
        placeholder="Search OpenRouter models"
        bind:value={openRouterSearch}
      />
    </div>

    <div class="divide-y divide-border/15" style="max-height: 360px; overflow: auto;">
      {#if filteredOpenRouterModels.length === 0}
        <div class="text-text-muted text-[12px] text-center" style="padding: 16px;">
          {#if !$settings.aiOpenRouterApiKey.trim()}
            Enter an API key above to load models.
          {:else}
            No models found. Click Refresh Models.
          {/if}
        </div>
      {:else}
        {#each filteredOpenRouterModels as model (model.id)}
          <div class="model-row">
            <div
              class="rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(model.id) ? 'bg-accent' : 'bg-bg-active'}"
            style="width: 38px; height: 22px; {isEnabled(model.id) ? '' : 'border: 1px solid rgba(255,255,255,0.15);'}"
              onclick={() => toggleEnabled(model.id)}
            >
              <div class="absolute rounded-full shadow transition-transform"
              style="top: 2px; width: 18px; height: 18px; background: {isEnabled(model.id) ? '#fff' : 'rgba(255,255,255,0.6)'}; transform: translateX({isEnabled(model.id) ? '18px' : '2px'});"></div>
            </div>
            <div class="flex-1 min-w-0 truncate">
              <span class="text-text-primary text-[13px] font-medium">{getModelDisplayName(model)}</span>
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.8;">{model.id}</span>
              {#if model.context_length}
                <span class="text-text-muted text-[11px]" style="margin-left: 8px;">{formatContext(model.context_length)}</span>
              {/if}
            </div>
            {#if isDefault(model.id)}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {:else if isEnabled(model.id)}
              <button
                class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
                style="padding: 2px 8px;"
                onclick={() => setDefault(model.id, 'openrouter')}
              >Set Default</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>

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
            oninput={(e) => {
              updateSetting('aiOpenAIApiKey', e.currentTarget.value);
              if (!($settings.aiOpenAIOAuthAccessToken || '').trim()) {
                updateSetting('aiAuthMode', 'apiKey');
              }
            }}
          />
          <button
            class="text-text-muted hover:text-text-primary text-[11px] shrink-0"
            style="padding: 4px 6px;"
            onclick={() => toggleShowKey('openai')}
          >{showApiKey['openai'] ? 'Hide' : 'Show'}</button>
        </div>
      </div>

      <div class="flex items-center" style="gap: 8px; margin-top: 10px;">
        <button
          class="text-[11px] border border-border/40 rounded hover:border-accent/40 disabled:opacity-50"
          style="padding: 4px 8px;"
          onclick={handleOpenAIOAuthStart}
          disabled={openAIDeviceBusy}
        >{openAIDeviceBusy ? 'Working...' : 'Step 1: Start Device Login'}</button>
        <button
          class="text-[11px] rounded disabled:opacity-40 disabled:border-border/30 disabled:bg-transparent disabled:text-text-muted disabled:cursor-not-allowed border border-accent/50 bg-accent/15 text-accent hover:bg-accent/20"
          style="padding: 4px 10px; font-weight: 700;"
          onclick={handleOpenAIOAuthComplete}
          disabled={openAIDeviceBusy || !openAIDeviceState}
        >Step 2: Complete OAuth</button>
        <button
          class="text-[11px] border border-border/40 rounded hover:border-error/40 disabled:opacity-50"
          style="padding: 4px 8px;"
          onclick={handleOpenAIOAuthCancel}
          disabled={openAIDeviceBusy || !openAIDeviceState}
        >Cancel</button>
      </div>

      {#if openAIDeviceState}
        <div class="text-[11px] text-text-muted" style="margin-top: 8px; line-height: 1.6;">
          <div class="flex items-center" style="gap: 8px;">
            <span>Code: <span class="font-mono text-text-primary">{openAIDeviceState.userCode}</span></span>
            <button
              class="text-[10px] border border-border/40 rounded hover:border-accent/40"
              style="padding: 2px 6px;"
              onclick={() => copyToClipboard(openAIDeviceState?.userCode || '')}
            >Copy code</button>
          </div>
          <div>
            Verify at
            <a href={openAIDeviceState.verificationUrl} class="text-accent underline" target="_blank" rel="noreferrer">{openAIDeviceState.verificationUrl}</a>
          </div>
          <div class="text-accent" style="font-weight: 700;">After approving in browser, click Step 2: Complete OAuth.</div>
        </div>
      {/if}

      {#if openAIDeviceStatus}
        <div class="text-[11px] text-text-muted" style="margin-top: 6px;">{openAIDeviceStatus}</div>
      {/if}
      {#if $settings.aiOpenAIOAuthAccessToken}
        <div class="text-[11px] text-green-400" style="margin-top: 6px;">
          OAuth connected{#if $settings.aiOpenAIOAuthExpiresAt} (expires {$settings.aiOpenAIOAuthExpiresAt}){/if}
        </div>
        <div class="text-[11px] text-text-muted" style="margin-top: 4px;">
          OAuth token is active and takes precedence over API key.
        </div>
      {/if}
    </div>
    <div class="divide-y divide-border/15">
      {#each OPENAI_MODELS as model (model.id)}
        {@const fullId = `openai/${model.id}`}
        <div class="model-row">
          <div
            class="rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(fullId) ? 'bg-accent' : 'bg-bg-active'}"
            style="width: 38px; height: 22px; {isEnabled(fullId) ? '' : 'border: 1px solid rgba(255,255,255,0.15);'}"
            onclick={() => toggleEnabled(fullId)}
          >
            <div class="absolute rounded-full shadow transition-transform"
              style="top: 2px; width: 18px; height: 18px; background: {isEnabled(fullId) ? '#fff' : 'rgba(255,255,255,0.6)'}; transform: translateX({isEnabled(fullId) ? '18px' : '2px'});"></div>
          </div>
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
              onclick={() => setDefault(fullId, 'openai')}
            >Set Default</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

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
            <div
              class="rounded-full relative cursor-pointer transition-colors shrink-0 {isEnabled(model.id) ? 'bg-accent' : 'bg-bg-active'}"
            style="width: 38px; height: 22px; {isEnabled(model.id) ? '' : 'border: 1px solid rgba(255,255,255,0.15);'}"
              onclick={() => toggleEnabled(model.id)}
            >
              <div class="absolute rounded-full shadow transition-transform"
              style="top: 2px; width: 18px; height: 18px; background: {isEnabled(model.id) ? '#fff' : 'rgba(255,255,255,0.6)'}; transform: translateX({isEnabled(model.id) ? '18px' : '2px'});"></div>
            </div>
            <div class="flex-1 min-w-0 truncate">
              <span class="text-text-primary text-[13px] font-medium">{getModelDisplayName(model)}</span>
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.8;">{model.id}</span>
              <span class="text-text-muted text-[10px]" style="margin-left: 6px; opacity: 0.5;">(LM Studio)</span>
            </div>
            {#if isDefault(model.id)}
              <span class="text-accent text-[11px] font-medium border border-accent/30 rounded" style="padding: 2px 8px;">Default</span>
            {:else if isEnabled(model.id)}
              <button
                class="text-text-muted hover:text-accent text-[11px] border border-border/30 rounded hover:border-accent/30 transition-colors"
                style="padding: 2px 8px;"
                onclick={() => setDefault(model.id, 'lmstudio')}
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

  .enabled-model-row:hover {
    background: rgba(var(--bg-hover-rgb, 255, 255, 255), 0.05);
  }
</style>
