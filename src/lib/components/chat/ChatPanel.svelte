<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { get, writable, type Writable } from 'svelte/store';
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import type {
    UIMessage, UIToolCall, PendingConfirmation,
  } from '$lib/stores/chat';
  import { settings, updateSetting, getActiveAIBaseUrl, getActiveAIKey } from '$lib/stores/settings';
  import { ChatEngine } from '$lib/ai/chat/chat-engine';
  import { ChatSession } from '$lib/ai/chat/session';
  import type { AIChatSettings, ToolCall, ToolResult, ContextUsage } from '$lib/ai/types';
  import { refreshMcpToolDefinitions } from '$lib/ai/tools/mcp-registry';
  import { availableModels, fetchModels, inferContextLength } from '$lib/stores/models';
  import { chatInstances, moveChat, removeChat, updateChatModel, type ChatDock } from '$lib/stores/chat-instances';
  import { PROMPT_PROFILES, getPromptProfile } from '$lib/ai/prompts/base-prompts';
  import { getModelProfile, inferModelSettings } from '$lib/ai/model-registry';

  // ── Per-instance state management ─────────────────────────────────

  interface InstanceState {
    messages: Writable<UIMessage[]>;
    isLoading: Writable<boolean>;
    pendingConfirmation: Writable<PendingConfirmation | null>;
    engine: ChatEngine | null;
    currentStreamingId: string | null;
  }

  const instanceStateMap = new Map<string, InstanceState>();

  function getInstanceState(id: string): InstanceState {
    let state = instanceStateMap.get(id);
    if (!state) {
      state = {
        messages: writable<UIMessage[]>([]),
        isLoading: writable(false),
        pendingConfirmation: writable<PendingConfirmation | null>(null),
        engine: null,
        currentStreamingId: null,
      };
      instanceStateMap.set(id, state);
    }
    return state;
  }

  /** Clean up instance state when a chat is removed */
  export function destroyInstanceState(id: string) {
    const state = instanceStateMap.get(id);
    if (state?.engine) {
      state.engine.abort();
    }
    instanceStateMap.delete(id);
  }

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
  let attemptedModelFetch = $state(false);
  let promptSelectorOpen = $state(false);
  let promptSelectorBtn: HTMLButtonElement;
  let promptDropdownPos = $state<{ top: number; left: number } | null>(null);
  let selectedPromptId = $state($settings.aiBasePrompt || 'default');

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

  function inferContextWindow(modelId: string): number {
    return inferContextLength(modelId);
  }

  function resolveContextWindow(): number {
    const s = get(settings);
    const model = get(availableModels).find((m) => m.id === s.aiModel);
    if (model?.context_length) return model.context_length;
    const profile = getModelProfile(s.aiModel);
    if (profile) return profile.contextWindow;
    return inferContextWindow(s.aiModel);
  }

  function visibleContextUsage(): ContextUsage {
    if (contextUsage) return contextUsage;
    const max = resolveContextWindow();
    return {
      usedTokens: 0,
      maxTokens: max,
      remainingTokens: max,
      usedPercent: 0,
    };
  }

  function getAISettings(): AIChatSettings {
    const s = get(settings);
    return {
      provider: s.aiProvider,
      authMode: s.aiAuthMode,
      apiKey: getActiveAIKey(s),
      model: s.aiModel,
      baseUrl: getActiveAIBaseUrl(s).replace(/\/+$/, ''),
      temperature: s.aiTemperature,
      maxTokens: s.aiMaxTokens,
      contextWindow: resolveContextWindow(),
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

    const aiSettings = getAISettings();
    if (!aiSettings.apiKey) return;

    if (!istate.engine) {
      istate.engine = initEngine();
    }
    istate.engine.updateSettings(getAISettings());

    await refreshMcpToolDefinitions();

    addUIMessage('user', message, payload);

    istate.isLoading.set(true);
    istate.currentStreamingId = addStreamingMessage();
    scrollToBottom();

    await istate.engine.sendMessage(message, payload);
  }

  async function handleSteer(steer: string) {
    if (!steer.trim()) return;
    handleStop();
    await handleSend(`Steer: ${steer}`, { steer });
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

  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    return model.split('/').pop() || model;
  }

  function contextPercentText(): string {
    const usage = visibleContextUsage();
    return `${usage.usedPercent.toFixed(1)}% used`;
  }

  function contextTokenText(): string {
    const usage = visibleContextUsage();
    return `${usage.usedTokens.toLocaleString()} / ${usage.maxTokens.toLocaleString()} tokens`;
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
    if (get(istate.isLoading)) return;
    if (get(istate.messages).length === 0) return;
    if (!istate.engine) {
      istate.engine = initEngine();
    }
    try {
      const { usage, compacted } = await istate.engine.compactNow();
      contextUsage = usage;
      if (compacted) {
        addUIMessage('system', 'Manual compaction complete.');
      } else {
        addUIMessage('system', 'No compaction needed yet.');
      }
    } catch (e) {
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
  <div class="flex items-center justify-between shrink-0 border-b border-border/40 bg-bg-secondary/65 metal-sheen" style="padding: 0 16px; height: 52px;">
    <div class="flex items-center gap-2 min-w-0 overflow-hidden">
      <div class="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
          <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
        </svg>
      </div>
      <!-- Model quick switcher -->
      <div class="relative min-w-0">
        <button
          bind:this={modelSwitcherBtn}
          class="flex items-center gap-1.5 font-medium hover:text-accent transition-colors min-w-0
            {modelSwitcherOpen ? 'text-accent' : 'text-text-secondary'}"
          style="font-size: {$settings.aiChatFontSize + 1}px;"
          onclick={() => {
            if (!modelSwitcherOpen && modelSwitcherBtn) {
              const rect = modelSwitcherBtn.getBoundingClientRect();
              modelDropdownPos = { top: rect.bottom + 8, left: rect.left };
            }
            modelSwitcherOpen = !modelSwitcherOpen;
            modelSearchQuery = '';
            showAllModels = false;
          }}
        >
          <span class="truncate">{modelDisplayName($settings.aiModel)}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="shrink-0 opacity-50">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {#if getModelProfile($settings.aiModel)}
          {@const mp = getModelProfile($settings.aiModel)!}
          <div class="flex items-center" style="gap: 4px; margin-left: 4px;">
            {#if mp.supportsTools}
              <span class="text-accent/50" title="Tool use" style="font-size: {$settings.aiChatFontSize - 4}px;">T</span>
            {/if}
            {#if mp.supportsVision}
              <span class="text-accent/50" title="Vision" style="font-size: {$settings.aiChatFontSize - 4}px;">V</span>
            {/if}
            {#if mp.supportsThinking}
              <span class="text-accent/50" title="Thinking" style="font-size: {$settings.aiChatFontSize - 4}px;">R</span>
            {/if}
            <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 4}px;">{(mp.contextWindow / 1000).toFixed(0)}k</span>
          </div>
        {/if}
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
                {#if $settings.aiFavoriteModels.length > 0}
                  <div class="text-text-muted uppercase tracking-wider font-medium" style="font-size: {$settings.aiChatFontSize - 2}px; padding: 4px 12px 2px 12px;">Favorites</div>
                  {#each $settings.aiFavoriteModels.filter(f => !modelSearchQuery || f.toLowerCase().includes(modelSearchQuery.toLowerCase())) as fav}
                    {@const modelInfo = $availableModels.find(m => m.id === fav)}
                    {@const regProfile = getModelProfile(fav)}
                    {@const ctxLen = modelInfo?.context_length || regProfile?.contextWindow}
                    <button
                      class="w-full text-left font-mono hover:bg-bg-hover transition-colors truncate
                        {fav === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                      style="font-size: {$settings.aiChatFontSize}px; padding: 8px 12px;"
                      onclick={() => { updateSetting("aiModel", fav); modelSwitcherOpen = false; }}
                    >
                      <span class="truncate">{fav}</span>
                      {#if ctxLen}
                        <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;"> ({(ctxLen / 1000).toFixed(0)}k)</span>
                      {/if}
                    </button>
                  {/each}
                {:else}
                  <div class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 2}px; padding: 10px 12px;">Star models in Settings to add favorites</div>
                {/if}
              {:else}
                {#each $availableModels.filter(m => !modelSearchQuery || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())) as model}
                  <button
                    class="w-full text-left font-mono hover:bg-bg-hover transition-colors truncate
                      {model.id === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                    style="font-size: {$settings.aiChatFontSize}px; padding: 8px 12px;"
                    onclick={() => { updateSetting("aiModel", model.id); modelSwitcherOpen = false; }}
                  >
                    <span class="truncate">{model.id}</span>
                    {#if model.context_length}
                      <span class="text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;"> ({(model.context_length / 1000).toFixed(0)}k)</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
            <!-- Browse all models button -->
            {#if !showAllModels}
              <div class="border-t border-border/30" style="padding: 6px 10px;">
                <button
                  class="w-full text-center text-accent hover:bg-accent/10 rounded-md transition-colors"
                  style="font-size: {$settings.aiChatFontSize - 1}px; padding: 6px 0;"
                  onclick={() => { fetchModels(); showAllModels = true; }}
                >
                  Browse all models
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <!-- Prompt profile selector -->
      <div class="relative">
        <button
          bind:this={promptSelectorBtn}
          class="flex items-center gap-1 hover:text-accent transition-colors
            {promptSelectorOpen ? 'text-accent' : 'text-text-muted'}"
          style="font-size: {$settings.aiChatFontSize - 2}px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px;"
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
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="shrink-0 opacity-50">
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
    <div class="flex items-center gap-0.5 shrink-0 ml-2">
      <button
        class="h-8 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all whitespace-nowrap"
        style="font-size: {$settings.aiChatFontSize - 2}px; padding: 0 8px;"
        onclick={cycleDock}
        title="Move to next dock position"
      >
        {nextDockLabel()}
      </button>
      <button
        class="h-8 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all"
        style="font-size: {$settings.aiChatFontSize - 2}px; padding: 0 8px;"
        onclick={handleNewChat}
        title="Clear chat"
      >
        Clear
      </button>
      <button
        class="h-8 rounded-md text-text-muted hover:text-error hover:bg-error/10 transition-all flex items-center justify-center"
        style="width: 28px;"
        onclick={handleClose}
        title="Close chat"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Context bar -->
  <div class="border-b border-border/30 bg-bg-secondary/45" style="padding: 8px 12px;">
    <div class="flex items-center" style="gap: 8px;">
      <div class="flex-1 min-w-0">
        <div class="h-1.5 rounded-full bg-bg-active overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300" style={`width: ${contextProgressWidth()}; background: ${contextProgressColor()};`}></div>
        </div>
        <div class="mt-1 flex items-center gap-2 text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;">
          <span class="shrink-0">{contextPercentText()}</span>
          <span class="font-mono truncate">{contextTokenText()}</span>
          {#if cacheText()}
            <span class="text-accent/70 font-mono truncate">{cacheText()}</span>
          {/if}
        </div>
      </div>
      <button
        class="rounded-md shrink-0 whitespace-nowrap border border-border/40 bg-bg-secondary/60 text-text-muted hover:text-text-primary hover:bg-bg-hover/60 hover:border-border/60 transition-all"
        style="font-size: {$settings.aiChatFontSize - 3}px; height: 28px; padding: 0 10px;"
        onclick={handleCompactNow}
        disabled={$instanceIsLoading}
        title="Compact context now"
      >
        Compact
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto metal-inset rounded-lg" style="margin: 10px 10px 4px 10px;"
    bind:this={messagesContainer}
  >
    {#if $instanceMessages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center px-8 gap-5">
        <div class="w-14 h-14 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="text-accent/50">
            <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
          </svg>
        </div>
        <div class="space-y-2">
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

  <!-- Confirmation banner -->
  {#if $instancePendingConfirmation}
    <div class="mx-3 mb-2 p-3 rounded-lg border border-warning/25 bg-warning/8">
      <div class="flex items-center gap-2 mb-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-warning shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span class="text-text-primary font-medium" style="font-size: {$settings.aiChatFontSize - 1}px;">{$instancePendingConfirmation.toolName}</span>
      </div>
      <div class="text-text-muted font-mono mb-2.5 max-h-20 overflow-auto pl-[22px]" style="font-size: {$settings.aiChatFontSize - 2}px;">{$instancePendingConfirmation.arguments}</div>
      <div class="flex gap-2 pl-[22px]">
        <button
          class="px-3 py-1.5 rounded-md bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity"
          style="font-size: {$settings.aiChatFontSize - 2}px;"
          onclick={() => handleConfirm(true)}
        >Allow</button>
        <button
          class="px-3 py-1.5 rounded-md border border-border/60 text-text-muted hover:text-text-primary hover:border-border transition-colors"
          style="font-size: {$settings.aiChatFontSize - 2}px;"
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
