<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { get, writable, type Writable } from 'svelte/store';
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import type {
    UIMessage, UIToolCall, PendingConfirmation,
  } from '$lib/stores/chat';
  import { settings, updateSetting, getActiveAIBaseUrl, getActiveAIKey, aiSettingsVisible, inferProviderForModel, inferRoutingProviderForModel } from '$lib/stores/settings';
  import { ChatEngine } from '$lib/ai/chat/chat-engine';
  import { ChatSession } from '$lib/ai/chat/session';
  import type { AIChatSettings, ToolCall, ToolResult, ContextUsage } from '$lib/ai/types';
  import { refreshMcpToolDefinitions } from '$lib/ai/tools/mcp-registry';
  import { availableModels, fetchModels, getModelDisplayName, ensureLMStudioModelLoaded } from '$lib/stores/models';
  import { chatInstances, moveChat, removeChat, updateChatModel, type ChatDock } from '$lib/stores/chat-instances';
  import { PROMPT_PROFILES, getPromptProfile } from '$lib/ai/prompts/base-prompts';
  import { getModelProfile, inferModelSettings } from '$lib/ai/model-registry';
  import { getInstanceState, destroyInstanceState } from '$lib/stores/chat-instance-state';
  import { refreshOpenAIOAuthIfNeeded } from '$lib/utils/oauth';

  // ── Props ─────────────────────────────────────────────────────────

  interface Props {
    instanceId: string;
  }

  let { instanceId }: Props = $props();

  // ── Per-instance reactive state ───────────────────────────────────

  let istate = $derived(getInstanceState(instanceId));
  let instanceMessages = $derived(istate.messages);
  let instanceIsLoading = $derived(istate.isLoading);
  let instancePendingConfirmation = $derived(istate.pendingConfirmation);

  let messagesContainer: HTMLDivElement;
  let modelSwitcherOpen = $state(false);
  let modelSearchQuery = $state('');
  let showAllModels = $state(false);
  let modelDropdownPos = $state<{ top: number; left: number } | null>(null);
  let modelSwitcherBtn: HTMLButtonElement;
  let contextUsage = $state<ContextUsage | null>(null);
  let isCompacting = $state(false);
  let attemptedModelFetch = $state(false);
  let promptSelectorOpen = $state(false);
  let promptSelectorBtn: HTMLButtonElement;
  let promptDropdownPos = $state<{ top: number; left: number } | null>(null);
  let selectedPromptId = $state($settings.aiBasePrompt || 'default');
  let shouldAutoScroll = $state(true);
  const AUTO_SCROLL_THRESHOLD_PX = 96;

  // ── Helpers for per-instance message manipulation ─────────────────

  function addUIMessage(
    role: UIMessage['role'],
    content: string,
    options?: { mentions?: string[]; steer?: string; images?: Array<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; base64: string }> },
  ): string {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const msg: UIMessage = {
      id,
      role,
      content,
      thinking: '',
      mentions: options?.mentions,
      steer: options?.steer,
      images: options?.images,
      isStreaming: false,
      toolCalls: [],
      timestamp: Date.now(),
    };
    istate.messages.update((msgs) => [...msgs, msg]);
    return id;
  }

  function addStreamingMessage(): string {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const msg: UIMessage = {
      id,
      role: 'assistant',
      content: '',
      thinking: '',
      isStreaming: true,
      toolCalls: [],
      timestamp: Date.now(),
    };
    istate.messages.update((msgs) => [...msgs, msg]);
    return id;
  }

  function appendToStreamingMessage(id: string, chunk: string): void {
    istate.messages.update((msgs) =>
      msgs.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m))
    );
  }

  function appendThinkingToStreamingMessage(id: string, chunk: string): void {
    istate.messages.update((msgs) =>
      msgs.map((m) => (m.id === id ? { ...m, thinking: (m.thinking || '') + chunk } : m))
    );
  }

  function finalizeMessage(id: string): void {
    istate.messages.update((msgs) =>
      msgs.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
    );
  }

  function addToolCallToMessage(messageId: string, toolCall: UIToolCall): void {
    istate.messages.update((msgs) =>
      msgs.map((m) => {
        if (m.id !== messageId) return m;
        return { ...m, toolCalls: [...m.toolCalls, toolCall] };
      })
    );
  }

  function updateToolCallStatus(
    messageId: string,
    toolCallId: string,
    status: UIToolCall['status'],
    result?: string,
    isError?: boolean,
  ): void {
    istate.messages.update((msgs) =>
      msgs.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.id === toolCallId ? { ...tc, status, result, isError } : tc
          ),
        };
      })
    );
  }

  // ── AI Settings ───────────────────────────────────────────────────

  function resolveContextWindow(): number {
    const s = get(settings);
    const model = get(availableModels).find((m) => m.id === s.aiModel);
    if (model?.context_length) return model.context_length;
    return inferModelSettings(s.aiModel).contextWindow;
  }

  function visibleContextUsage(): ContextUsage {
    if (contextUsage) return contextUsage;
    const s = get(settings);
    const { maxOutputTokens } = inferModelSettings(s.aiModel);
    const fullWindow = resolveContextWindow();
    const effectiveBudget = Math.max(1, fullWindow - maxOutputTokens);
    return {
      usedTokens: 0,
      maxTokens: effectiveBudget,
      remainingTokens: effectiveBudget,
      usedPercent: 0,
      reservedOutputTokens: maxOutputTokens,
      isEstimated: true,
    };
  }

  function getAISettings(): AIChatSettings {
    const s = get(settings);
    const hasOpenAIOAuthToken = s.aiProvider === 'openai' && !!(s.aiOpenAIOAuthAccessToken || '').trim();
    return {
      provider: s.aiProvider,
      authMode: hasOpenAIOAuthToken ? 'oauth' : s.aiAuthMode,
      apiKey: getActiveAIKey(s),
      model: s.aiModel,
      baseUrl: getActiveAIBaseUrl(s).replace(/\/+$/, ''),
      temperature: s.aiTemperature,
      maxTokens: s.aiMaxTokens,
      contextWindow: resolveContextWindow(),
      openAICodexClientVersion: s.aiOpenAICodexClientVersion,
      enableToolUse: s.aiEnableToolUse,
      confirmWrites: s.aiConfirmWrites,
      yoloMode: s.aiYoloMode,
      maxToolIterations: s.aiMaxToolIterations,
      readInstructionsEachMessage: s.aiReadInstructionsEveryMessage,
    };
  }

  function initEngine(): ChatEngine {
    const session = new ChatSession();
    const aiSettings = getAISettings();

    const createdEngine = new ChatEngine(session, aiSettings, {
      onChunk: (content: string) => {
        if (istate.currentStreamingId) {
          appendToStreamingMessage(istate.currentStreamingId, content);
          scrollToBottom();
        }
      },
      onThinking: (content: string) => {
        if (istate.currentStreamingId) {
          appendThinkingToStreamingMessage(istate.currentStreamingId, content);
          scrollToBottom();
        }
      },
      onToolCall: (toolCalls: ToolCall[]) => {
        if (istate.currentStreamingId) {
          for (const tc of toolCalls) {
            const uiTc: UIToolCall = {
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
              status: 'running',
            };
            addToolCallToMessage(istate.currentStreamingId, uiTc);
          }
          scrollToBottom();
        }
      },
      onToolResult: (results: ToolResult[]) => {
        if (istate.currentStreamingId) {
          for (const r of results) {
            updateToolCallStatus(
              istate.currentStreamingId,
              r.toolCallId,
              r.isError ? 'error' : 'success',
              r.content,
              r.isError,
            );
          }
          finalizeMessage(istate.currentStreamingId);
          istate.currentStreamingId = addStreamingMessage();
          scrollToBottom();
        }
      },
      onToolConfirmation: (toolCall: ToolCall): Promise<boolean> => {
        return new Promise((resolve) => {
          istate.pendingConfirmation.set({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            arguments: toolCall.function.arguments,
            resolve,
          });
        });
      },
      onContextUsage: (usage: ContextUsage) => {
        contextUsage = usage;
      },
      onCompaction: (compactedMessageCount: number) => {
        addUIMessage('system', `Context compacted (${compactedMessageCount} earlier messages summarized).`);
      },
      onCompactionStart: () => {
        isCompacting = true;
        addUIMessage('system', 'Compacting context with AI summary...');
      },
      onCompactionEnd: () => {
        isCompacting = false;
      },
      onDone: (_fullContent: string) => {
        if (istate.currentStreamingId) {
          const msgs = get(istate.messages);
          const msg = msgs.find(m => m.id === istate.currentStreamingId);
          if (msg && !msg.content && msg.toolCalls.length === 0) {
            istate.messages.update(all => all.filter(m => m.id !== istate.currentStreamingId));
          } else {
            finalizeMessage(istate.currentStreamingId);
          }
          istate.currentStreamingId = null;
        }
        istate.isLoading.set(false);
      },
      onError: (error: string) => {
        if (istate.currentStreamingId) {
          const msgs = get(istate.messages);
          const msg = msgs.find(m => m.id === istate.currentStreamingId);
          if (msg && !msg.content) {
            let friendlyError = error;
            if (error.includes('401') || error.toLowerCase().includes('unauthorized') || error.toLowerCase().includes('authentication')) {
              friendlyError = 'Authentication failed. Check your API key in Settings > AI Chat.\n\n' + error;
            } else if (error.includes('429')) {
              friendlyError = 'Rate limited. Wait a moment and try again.';
            } else if (error.includes('403')) {
              friendlyError = 'Access denied. Your API key may not have access to this model.\n\n' + error;
            } else if (error.includes('404') && error.toLowerCase().includes('image')) {
              friendlyError = 'This model does not support image input. Try a vision-capable model (e.g. GPT-4o, Claude 3.5 Sonnet, Gemini Pro Vision).';
            } else if (error.includes('404')) {
              friendlyError = 'Model or endpoint not found. Check your model selection and API base URL.\n\n' + error;
            } else if (error.includes('400')) {
              friendlyError = 'Bad request. The model may not support the current settings.\n\n' + error;
            } else if (error.toLowerCase().includes('network') || error.toLowerCase().includes('failed to fetch')) {
              friendlyError = 'Network error. Check your connection and API base URL.';
            }
            appendToStreamingMessage(istate.currentStreamingId, friendlyError);
          }
          finalizeMessage(istate.currentStreamingId);
          istate.currentStreamingId = null;
        }
        istate.isLoading.set(false);
      },
    });

    createdEngine.setPromptProfile(selectedPromptId);
    contextUsage = createdEngine.getContextUsage();

    return createdEngine;
  }

  async function handleSend(
    message: string,
    payload?: {
      mentions?: string[];
      steer?: string;
      images?: Array<{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; base64: string }>;
      slashCommandName?: string;
      slashCommandPrompt?: string;
      slashCommandArgs?: string;
    },
  ) {
    if (!message.trim() && !(payload?.images?.length)) return;
    if (get(istate.isLoading)) return;

    if ($settings.aiProvider === 'openai' && !!($settings.aiOpenAIOAuthAccessToken || '').trim()) {
      try {
        await refreshOpenAIOAuthIfNeeded();
      } catch {
        // Let regular auth checks and request errors surface in chat UI.
      }
    }

    const aiSettings = getAISettings();

    if (aiSettings.provider === 'lmstudio') {
      try {
        await ensureLMStudioModelLoaded(aiSettings.baseUrl, aiSettings.model);
      } catch (e) {
        addUIMessage('system', `LM Studio model load failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    if (!aiSettings.apiKey) return;

    if (!istate.engine) {
      istate.engine = initEngine();
    }
    istate.engine.updateSettings(getAISettings());

    await refreshMcpToolDefinitions();

    addUIMessage('user', message, payload);

    istate.isLoading.set(true);
    istate.currentStreamingId = addStreamingMessage();
    scrollToBottom(true);

    await istate.engine.sendMessage(message, payload);
  }

  async function handleSteer(steer: string) {
    if (!steer.trim()) return;
    // Abort current run (this also cleans up orphaned tool calls in the session)
    istate.engine?.abort();
    if (istate.currentStreamingId) {
      finalizeMessage(istate.currentStreamingId);
      istate.currentStreamingId = null;
    }
    istate.isLoading.set(false);

    // Small delay to let abort propagate
    await new Promise(r => setTimeout(r, 50));

    // Send as a regular message (the AI will see the full conversation + this new message)
    await handleSend(steer);
  }

  function handleStop() {
    istate.engine?.abort();
    if (istate.currentStreamingId) {
      finalizeMessage(istate.currentStreamingId);
      istate.currentStreamingId = null;
    }
    istate.isLoading.set(false);
  }

  function handleNewChat() {
    istate.engine?.abort();
    istate.messages.set([]);
    istate.engine = null;
    istate.currentStreamingId = null;
    contextUsage = null;
    istate.isLoading.set(false);
  }

  function handleConfirm(confirmed: boolean) {
    const pending = get(istate.pendingConfirmation);
    if (pending) {
      pending.resolve(confirmed);
      istate.pendingConfirmation.set(null);
    }
  }

  function isNearBottom(): boolean {
    if (!messagesContainer) return true;
    const distanceFromBottom =
      messagesContainer.scrollHeight - (messagesContainer.scrollTop + messagesContainer.clientHeight);
    return distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
  }

  function handleMessagesScroll() {
    shouldAutoScroll = isNearBottom();
  }

  function jumpToLatest() {
    shouldAutoScroll = true;
    void scrollToBottom(true);
  }

  async function scrollToBottom(force = false) {
    if (!force && !shouldAutoScroll) return;
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      shouldAutoScroll = true;
    }
  }

  onDestroy(() => {
    // Don't destroy instance state here - it persists across dock moves
    // destroyInstanceState is called when removeChat is invoked
  });

  $effect(() => {
    $instanceMessages;
    scrollToBottom();
  });

  $effect(() => {
    $settings.aiProvider;
    attemptedModelFetch = false;
  });

  $effect(() => {
    $settings.aiProvider;
    $settings.aiOpenRouterApiKey;
    $settings.aiOpenAIApiKey;
    $settings.aiOpenAIOAuthAccessToken;
    $settings.aiAnthropicApiKey;
    $availableModels;
    if (!getActiveAIKey($settings) || attemptedModelFetch || $availableModels.length > 0) {
      return;
    }
    attemptedModelFetch = true;
    void fetchModels();
  });

  $effect(() => {
    if ($settings.aiYoloMode && $instancePendingConfirmation) {
      handleConfirm(true);
    }
  });

  $effect(() => {
    $settings.aiModel;
    $settings.aiMaxTokens;
    $availableModels;
    if (istate.engine) {
      const prevProvider = istate.engine.currentProvider;
      const newSettings = getAISettings();
      istate.engine.updateSettings(newSettings);
      contextUsage = istate.engine.getContextUsage();

      // Notify when provider changes mid-conversation
      if (prevProvider && prevProvider !== newSettings.provider && get(istate.messages).length > 0) {
        addUIMessage('system', `Switched to ${newSettings.provider} provider. Context has been preserved.`);
      }
    }
  });

  function modelDisplayName(model: string): string {
    const info = $availableModels.find((m) => m.id === model);
    if (info) return getModelDisplayName(info);
    return getModelDisplayName(model);
  }

  function selectModel(modelId: string): void {
    updateSetting('aiModel', modelId);
    const routedProvider = inferRoutingProviderForModel(modelId, $settings.aiProvider);
    updateSetting('aiProvider', routedProvider);
    modelSwitcherOpen = false;
  }

  function contextPercentText(): string {
    const usage = visibleContextUsage();
    return `${usage.usedPercent.toFixed(1)}% used`;
  }

  function contextTokenText(): string {
    const usage = visibleContextUsage();
    const label = usage.isEstimated ? 'tokens (est)' : 'tokens';
    return `${usage.usedTokens.toLocaleString()} / ${usage.maxTokens.toLocaleString()} ${label}`;
  }

  function contextProgressWidth(): string {
    const usage = visibleContextUsage();
    return `${Math.max(0, Math.min(100, usage.usedPercent)).toFixed(2)}%`;
  }

  function contextProgressColor(): string {
    const usage = visibleContextUsage();
    if (usage.usedPercent >= 80) return 'rgb(239, 68, 68)';
    if (usage.usedPercent >= 50) return 'rgb(234, 179, 8)';
    return 'rgb(34, 197, 94)';
  }

  function cacheText(): string | null {
    const usage = visibleContextUsage();
    if (!usage.cacheReadTokens && !usage.cacheCreationTokens) return null;
    const parts: string[] = [];
    if (usage.cacheReadTokens) parts.push(`cache read: ${usage.cacheReadTokens.toLocaleString()}`);
    if (usage.cacheCreationTokens) parts.push(`cache write: ${usage.cacheCreationTokens.toLocaleString()}`);
    return parts.join(' | ');
  }

  async function handleCompactNow() {
    if (get(istate.isLoading) || isCompacting) return;
    if (get(istate.messages).length === 0) return;
    if (!istate.engine) {
      istate.engine = initEngine();
    }
    try {
      const { usage, compacted } = await istate.engine.compactNow();
      contextUsage = usage;
      if (!compacted) {
        addUIMessage('system', 'No compaction needed yet.');
      }
    } catch (e) {
      isCompacting = false;
      addUIMessage('system', `Compaction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function currentDock(): ChatDock {
    const inst = get(chatInstances).find(c => c.id === instanceId);
    return inst?.dock ?? 'right';
  }

  function cycleDock() {
    const docks: ChatDock[] = ['right', 'bottom', 'tab'];
    const currentIdx = docks.indexOf(currentDock());
    const nextIdx = (currentIdx + 1) % docks.length;
    moveChat(instanceId, docks[nextIdx]);
  }

  function nextDockLabel(): string {
    const dock = currentDock();
    if (dock === 'right') return 'Dock Bottom';
    if (dock === 'bottom') return 'Dock Tab';
    return 'Dock Right';
  }

  function handleClose() {
    handleStop();
    destroyInstanceState(instanceId);
    removeChat(instanceId);
  }
</script>

<div class="flex flex-col h-full metal-frame rounded-xl overflow-hidden panel-lift" style="font-size: {$settings.aiChatFontSize}px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-weight: 500;">
  <!-- Header -->
  <div class="shrink-0 border-b border-border/40 bg-bg-secondary/65 metal-sheen" style="padding: 10px 12px 8px 12px;">
    <!-- Row 1: model + actions -->
    <div class="flex items-center justify-between" style="gap: 8px;">
      <div class="flex items-center min-w-0 flex-1" style="gap: 8px;">
        <!-- Model quick switcher -->
        <div class="relative min-w-0 flex-1">
          <button
            bind:this={modelSwitcherBtn}
            class="flex items-center font-semibold hover:text-accent transition-colors min-w-0
              {modelSwitcherOpen ? 'text-accent' : 'text-text-primary'}"
            style="font-size: {$settings.aiChatFontSize}px; gap: 6px; letter-spacing: -0.01em;"
            onclick={() => {
              if (!modelSwitcherOpen && modelSwitcherBtn) {
                const rect = modelSwitcherBtn.getBoundingClientRect();
                modelDropdownPos = { top: rect.bottom + 8, left: rect.left };
              }
              modelSwitcherOpen = !modelSwitcherOpen;
              modelSearchQuery = '';
              showAllModels = false;
            }}
            title={$settings.aiModel}
          >
            <span class="truncate">{modelDisplayName($settings.aiModel)}</span>
            <span class="text-text-muted shrink-0" style="font-size: {Math.max(10, $settings.aiChatFontSize - 3)}px; font-weight: 400; opacity: 0.5;">({inferProviderForModel($settings.aiModel, $settings.aiProvider)})</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0 opacity-40">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        {#if modelSwitcherOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => modelSwitcherOpen = false}></div>
          <div class="fixed z-50 min-w-[280px] max-w-[380px] max-h-[420px] flex flex-col
            bg-bg-secondary border border-border/50 rounded-lg shadow-2xl shadow-black/40 overflow-hidden"
            style="top: {modelDropdownPos?.top ?? 0}px; left: {modelDropdownPos?.left ?? 0}px;">
            <!-- Search input -->
            <div style="padding: 8px 10px;">
              <input
                type="text"
                bind:value={modelSearchQuery}
                placeholder="Search models..."
                class="w-full bg-bg-primary border border-border/40 rounded-md text-text-primary outline-none focus:border-accent/40"
                style="font-size: {$settings.aiChatFontSize - 1}px; padding: 6px 10px;"
              />
            </div>
            <div class="overflow-y-auto flex-1">
              {#if !showAllModels}
                <!-- Enabled models -->
                {@const nonFavEnabled = ($settings.aiEnabledModels || [])}
                {#if nonFavEnabled.length > 0}
                  <div class="text-text-muted uppercase tracking-wider font-medium" style="font-size: {$settings.aiChatFontSize - 2}px; padding: 4px 12px 2px 12px;">Enabled</div>
                  {#each nonFavEnabled.filter(m => !modelSearchQuery || m.toLowerCase().includes(modelSearchQuery.toLowerCase())) as model}
                    {@const modelInfo = $availableModels.find(m => m.id === model)}
                    {@const regProfile = getModelProfile(model)}
                    {@const ctxLen = modelInfo?.context_length || regProfile?.contextWindow}
                    <button
                      class="w-full text-left font-mono hover:bg-bg-hover transition-colors truncate
                        {model === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                      style="font-size: {$settings.aiChatFontSize}px; padding: 8px 12px;"
                      onclick={() => selectModel(model)}
                    >
                      <span class="truncate">{modelDisplayName(model)}</span>
                      {#if ctxLen}
                        <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;"> ({(ctxLen / 1000).toFixed(0)}k)</span>
                      {/if}
                      <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px; opacity: 0.75;"> {model}</span>
                      <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px; opacity: 0.5;"> {inferProviderForModel(model, $settings.aiProvider)}</span>
                    </button>
                  {/each}
                {/if}
                {#if !$settings.aiEnabledModels || $settings.aiEnabledModels.length === 0}
                  <div class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 2}px; padding: 10px 12px;">Enable models in AI & Models settings</div>
                {/if}
              {:else}
                {#each $availableModels.filter(m => !modelSearchQuery || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())) as model}
                  <button
                    class="w-full text-left font-mono hover:bg-bg-hover transition-colors truncate
                      {model.id === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                    style="font-size: {$settings.aiChatFontSize}px; padding: 8px 12px;"
                     onclick={() => selectModel(model.id)}
                   >
                     <span class="truncate">{getModelDisplayName(model)}</span>
                     {#if model.context_length}
                       <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;"> ({(model.context_length / 1000).toFixed(0)}k)</span>
                     {/if}
                     <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px; opacity: 0.75;"> {model.id}</span>
                     <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px; opacity: 0.5;"> {inferProviderForModel(model.id, $settings.aiProvider)}</span>
                  </button>
                {/each}
              {/if}
            </div>
            <!-- Footer links -->
            <div class="border-t border-border/30" style="padding: 6px 10px;">
              {#if !showAllModels}
                <button
                  class="w-full text-center text-accent hover:bg-accent/10 rounded-md transition-colors"
                  style="font-size: {$settings.aiChatFontSize - 1}px; padding: 6px 0;"
                  onclick={() => { fetchModels(); showAllModels = true; }}
                >
                  Browse all models
                </button>
              {/if}
              <button
                class="w-full text-center text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                style="font-size: {$settings.aiChatFontSize - 1}px; padding: 6px 0;"
                onclick={() => { modelSwitcherOpen = false; aiSettingsVisible.set(true); }}
              >
                Manage Models...
              </button>
            </div>
          </div>
        {/if}
      </div>
      <!-- Model capability badges -->
      {#if getModelProfile($settings.aiModel)}
        {@const mp = getModelProfile($settings.aiModel)!}
        <div class="flex items-center shrink-0" style="gap: 4px;">
          {#if mp.supportsTools}
            <span class="rounded-full border border-accent/20 bg-accent/8 text-accent/70 font-medium select-none" title="Tool use" style="font-size: {Math.max(9, $settings.aiChatFontSize - 5)}px; padding: 1px 5px; line-height: 1.4;">T</span>
          {/if}
          {#if mp.supportsVision}
            <span class="rounded-full border border-accent/20 bg-accent/8 text-accent/70 font-medium select-none" title="Vision" style="font-size: {Math.max(9, $settings.aiChatFontSize - 5)}px; padding: 1px 5px; line-height: 1.4;">V</span>
          {/if}
          {#if mp.supportsThinking}
            <span class="rounded-full border border-accent/20 bg-accent/8 text-accent/70 font-medium select-none" title="Thinking" style="font-size: {Math.max(9, $settings.aiChatFontSize - 5)}px; padding: 1px 5px; line-height: 1.4;">R</span>
          {/if}
        </div>
      {/if}
      </div>
      <!-- Action buttons -->
      <div class="flex items-center shrink-0" style="gap: 1px;">
        <button
          class="rounded-md text-text-muted/60 hover:text-text-primary hover:bg-white/5 transition-all flex items-center justify-center"
          style="width: 28px; height: 28px;"
          onclick={handleNewChat}
          title="Clear chat"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
          </svg>
        </button>
        <button
          class="rounded-md text-text-muted/60 hover:text-text-primary hover:bg-white/5 transition-all flex items-center justify-center"
          style="width: 28px; height: 28px;"
          onclick={cycleDock}
          title={nextDockLabel()}
        >
          {#if currentDock() === 'right'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
          {:else if currentDock() === 'bottom'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          {/if}
        </button>
        <button
          class="rounded-md text-text-muted/60 hover:text-error hover:bg-error/10 transition-all flex items-center justify-center"
          style="width: 28px; height: 28px;"
          onclick={handleClose}
          title="Close chat"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    <!-- Row 2: prompt profile -->
    <div class="flex items-center" style="margin-top: 6px; gap: 6px;">
      <!-- Prompt profile selector -->
      <div class="relative">
        <button
          bind:this={promptSelectorBtn}
          class="flex items-center hover:text-accent transition-colors
            {promptSelectorOpen ? 'text-accent' : 'text-text-muted/70'}"
          style="font-size: {Math.max(10, $settings.aiChatFontSize - 3)}px; padding: 2px 8px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; gap: 4px; background: rgba(255,255,255,0.03);"
          onclick={() => {
            if (!promptSelectorOpen && promptSelectorBtn) {
              const rect = promptSelectorBtn.getBoundingClientRect();
              promptDropdownPos = { top: rect.bottom + 4, left: rect.left };
            }
            promptSelectorOpen = !promptSelectorOpen;
          }}
          title="Select prompt profile"
        >
          <span class="truncate">{getPromptProfile(selectedPromptId).name}</span>
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="shrink-0 opacity-50">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {#if promptSelectorOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => promptSelectorOpen = false}></div>
          <div class="fixed z-50 min-w-[220px] max-w-[300px]
            bg-bg-secondary border border-border/50 rounded-lg shadow-2xl shadow-black/40 overflow-hidden"
            style="top: {promptDropdownPos?.top ?? 0}px; left: {promptDropdownPos?.left ?? 0}px;">
            {#each PROMPT_PROFILES as profile}
              <button
                class="w-full text-left hover:bg-bg-hover transition-colors
                  {profile.id === selectedPromptId ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                style="padding: 8px 12px;"
                onclick={() => {
                  selectedPromptId = profile.id;
                  updateSetting('aiBasePrompt', profile.id);
                  if (istate.engine) {
                    istate.engine.setPromptProfile(profile.id);
                  }
                  promptSelectorOpen = false;
                }}
              >
                <div class="font-medium" style="font-size: {$settings.aiChatFontSize - 1}px;">{profile.name}</div>
                <div class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;">{profile.description}</div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Context bar -->
  <div class="border-b border-border/20" style="padding: 6px 12px; background: rgba(0,0,0,0.15);">
    <div class="flex items-center" style="gap: 10px;">
      <div class="flex-1 min-w-0">
        <div class="rounded-full overflow-hidden" style="height: 3px; background: rgba(255,255,255,0.06);">
          <div class="h-full rounded-full transition-all duration-500 ease-out" style={`width: ${contextProgressWidth()}; background: ${contextProgressColor()}; opacity: 0.8;`}></div>
        </div>
        <div class="flex items-center text-text-muted/60" style="font-size: {Math.max(9, $settings.aiChatFontSize - 3)}px; margin-top: 3px; gap: 6px;">
          <span class="shrink-0 font-medium">{contextPercentText()}</span>
          <span class="font-mono truncate" style="opacity: 0.7;">{contextTokenText()}</span>
          {#if cacheText()}
            <span class="text-accent/50 font-mono truncate">{cacheText()}</span>
          {/if}
        </div>
      </div>
      <button
        class="rounded-md shrink-0 whitespace-nowrap text-text-muted/50 hover:text-text-primary hover:bg-white/5 transition-all {isCompacting ? 'opacity-50 cursor-wait' : ''}"
        style="font-size: {Math.max(9, $settings.aiChatFontSize - 3)}px; height: 24px; padding: 0 8px; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;"
        onclick={handleCompactNow}
        disabled={$instanceIsLoading || isCompacting}
        title="Compact context now"
      >
        {isCompacting ? 'Compacting...' : 'Compact'}
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto metal-inset rounded-lg" style="margin: 10px 10px 4px 10px;"
    bind:this={messagesContainer}
    onscroll={handleMessagesScroll}
  >
    {#if $instanceMessages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center" style="padding: 0 32px; gap: 20px;">
        <div class="rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center" style="width: 56px; height: 56px;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="text-accent/50">
            <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div class="text-text-secondary font-medium" style="font-size: {$settings.aiChatFontSize + 3}px;">Ask about your workspace</div>
          <div class="text-text-muted leading-relaxed max-w-[280px]" style="font-size: {$settings.aiChatFontSize}px;">
            Read files, search code, edit files, and run commands
          </div>
        </div>
      </div>
    {:else}
      <div style="padding: 16px 0 32px 0;">
        {#each $instanceMessages as message (message.id)}
          <ChatMessage {message} />
        {/each}
      </div>
    {/if}
  </div>

  {#if !shouldAutoScroll && $instanceMessages.length > 0}
    <div class="flex justify-center" style="margin: 0 12px 8px 12px;">
      <button
        class="rounded-full border border-accent/30 bg-bg-secondary/95 text-accent hover:bg-accent/12 transition-colors shadow-lg"
        style="font-size: {Math.max(11, $settings.aiChatFontSize - 2)}px; padding: 6px 12px;"
        onclick={jumpToLatest}
        title="Jump to latest message"
      >
        Jump to latest
      </button>
    </div>
  {/if}

  <!-- Confirmation banner -->
  {#if $instancePendingConfirmation}
    <div class="rounded-lg border border-warning/25 bg-warning/8" style="margin: 0 12px 8px 12px; padding: 12px;">
      <div class="flex items-center" style="gap: 8px; margin-bottom: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-warning shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span class="text-text-primary font-medium" style="font-size: {$settings.aiChatFontSize - 1}px;">{$instancePendingConfirmation.toolName}</span>
      </div>
      <div class="text-text-muted font-mono max-h-20 overflow-auto" style="font-size: {$settings.aiChatFontSize - 2}px; margin-bottom: 10px; padding-left: 22px;">{$instancePendingConfirmation.arguments}</div>
      <div class="flex" style="gap: 8px; padding-left: 22px;">
        <button
          class="rounded-md bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity"
          style="font-size: {$settings.aiChatFontSize - 2}px; padding: 6px 12px;"
          onclick={() => handleConfirm(true)}
        >Allow</button>
        <button
          class="rounded-md border border-border/60 text-text-muted hover:text-text-primary hover:border-border transition-colors"
          style="font-size: {$settings.aiChatFontSize - 2}px; padding: 6px 12px;"
          onclick={() => handleConfirm(false)}
        >Deny</button>
      </div>
    </div>
  {/if}

  <!-- Input -->
  <ChatInput
    onSend={handleSend}
    onStop={handleStop}
    onSteer={handleSteer}
    isLoading={$instanceIsLoading}
    disabled={!getActiveAIKey($settings)}
  />
</div>
