<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import {
    chatMessages, chatIsLoading, clearChat, addUIMessage, addStreamingMessage,
    appendToStreamingMessage, appendThinkingToStreamingMessage, finalizeMessage, addToolCallToMessage,
    updateToolCallStatus, pendingConfirmation,
    type PendingConfirmation, type UIToolCall,
  } from '$lib/stores/chat';
  import { chatPanelDock } from '$lib/stores/chat';
  import { settings, updateSetting, getActiveAIBaseUrl, getActiveAIKey } from '$lib/stores/settings';
  import { ChatEngine } from '$lib/ai/chat/chat-engine';
  import { ChatSession } from '$lib/ai/chat/session';
  import type { AIChatSettings, ToolCall, ToolResult, ContextUsage } from '$lib/ai/types';
  import { refreshMcpToolDefinitions } from '$lib/ai/tools/mcp-registry';
  import { availableModels, fetchModels, inferContextLength } from '$lib/stores/models';

  let messagesContainer: HTMLDivElement;
  let engine: ChatEngine | null = null;
  let currentStreamingId: string | null = null;
  let modelSwitcherOpen = $state(false);
  let contextUsage = $state<ContextUsage | null>(null);
  let attemptedModelFetch = $state(false);

  function inferContextWindow(modelId: string): number {
    return inferContextLength(modelId);
  }

  function resolveContextWindow(): number {
    const s = get(settings);
    const model = get(availableModels).find((m) => m.id === s.aiModel);
    return model?.context_length || inferContextWindow(s.aiModel);
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
        if (currentStreamingId) {
          appendToStreamingMessage(currentStreamingId, content);
          scrollToBottom();
        }
      },
      onThinking: (content: string) => {
        if (currentStreamingId) {
          appendThinkingToStreamingMessage(currentStreamingId, content);
          scrollToBottom();
        }
      },
      onToolCall: (toolCalls: ToolCall[]) => {
        if (currentStreamingId) {
          for (const tc of toolCalls) {
            const uiTc: UIToolCall = {
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
              status: 'running',
            };
            addToolCallToMessage(currentStreamingId, uiTc);
          }
          scrollToBottom();
        }
      },
      onToolResult: (results: ToolResult[]) => {
        if (currentStreamingId) {
          for (const r of results) {
            updateToolCallStatus(
              currentStreamingId,
              r.toolCallId,
              r.isError ? 'error' : 'success',
              r.content,
              r.isError,
            );
          }
          finalizeMessage(currentStreamingId);
          currentStreamingId = addStreamingMessage();
          scrollToBottom();
        }
      },
      onToolConfirmation: (toolCall: ToolCall): Promise<boolean> => {
        return new Promise((resolve) => {
          pendingConfirmation.set({
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
        if (currentStreamingId) {
          const msgs = get(chatMessages);
          const msg = msgs.find(m => m.id === currentStreamingId);
          if (msg && !msg.content && msg.toolCalls.length === 0) {
            chatMessages.update(all => all.filter(m => m.id !== currentStreamingId));
          } else {
            finalizeMessage(currentStreamingId);
          }
          currentStreamingId = null;
        }
        chatIsLoading.set(false);
      },
      onError: (error: string) => {
        if (currentStreamingId) {
          const msgs = get(chatMessages);
          const msg = msgs.find(m => m.id === currentStreamingId);
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
            appendToStreamingMessage(currentStreamingId, friendlyError);
          }
          finalizeMessage(currentStreamingId);
          currentStreamingId = null;
        }
        chatIsLoading.set(false);
      },
    });

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
    if (get(chatIsLoading)) return;

    const aiSettings = getAISettings();
    if (!aiSettings.apiKey) return;

    if (!engine) {
      engine = initEngine();
    }
    engine.updateSettings(getAISettings());

    await refreshMcpToolDefinitions();

    addUIMessage('user', message, payload);

    chatIsLoading.set(true);
    currentStreamingId = addStreamingMessage();
    scrollToBottom();

    await engine.sendMessage(message, payload);
  }

  async function handleSteer(steer: string) {
    if (!steer.trim()) return;
    handleStop();
    await handleSend(`Steer: ${steer}`, { steer });
  }

  function handleStop() {
    engine?.abort();
    if (currentStreamingId) {
      finalizeMessage(currentStreamingId);
      currentStreamingId = null;
    }
    chatIsLoading.set(false);
  }

  function handleNewChat() {
    engine?.abort();
    clearChat();
    engine = null;
    currentStreamingId = null;
    contextUsage = null;
    chatIsLoading.set(false);
  }

  function handleConfirm(confirmed: boolean) {
    const pending = get(pendingConfirmation);
    if (pending) {
      pending.resolve(confirmed);
      pendingConfirmation.set(null);
    }
  }

  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  onDestroy(() => {
    if (engine) {
      engine.abort();
    }
  });

  $effect(() => {
    $chatMessages;
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
    if ($settings.aiYoloMode && $pendingConfirmation) {
      handleConfirm(true);
    }
  });

  $effect(() => {
    $settings.aiModel;
    $settings.aiMaxTokens;
    $availableModels;
    if (engine) {
      const prevProvider = engine.currentProvider;
      const newSettings = getAISettings();
      engine.updateSettings(newSettings);
      contextUsage = engine.getContextUsage();

      // Notify when provider changes mid-conversation
      if (prevProvider && prevProvider !== newSettings.provider && get(chatMessages).length > 0) {
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

  async function handleCompactNow() {
    if (get(chatIsLoading)) return;
    if (get(chatMessages).length === 0) return;
    if (!engine) {
      engine = initEngine();
    }
    try {
      const { usage, compacted } = await engine.compactNow();
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

  function cycleDock() {
    let next: 'right' | 'bottom' | 'tab';
    if ($chatPanelDock === 'right') {
      next = 'bottom';
    } else if ($chatPanelDock === 'bottom') {
      next = 'tab';
    } else {
      next = 'right';
    }
    updateSetting('aiChatDock', next);
  }

  function nextDockLabel(): string {
    if ($chatPanelDock === 'right') return 'Dock Bottom';
    if ($chatPanelDock === 'bottom') return 'Dock Tab';
    return 'Dock Right';
  }
</script>

<div class="flex flex-col h-full metal-frame rounded-xl overflow-hidden panel-lift" style="font-size: {$settings.aiChatFontSize}px;">
  <!-- Header -->
  <div class="flex items-center justify-between shrink-0 border-b border-border/40 bg-bg-secondary/65 metal-sheen" style="padding: 0 12px; height: 48px;">
    <div class="flex items-center gap-2 min-w-0 overflow-hidden">
      <div class="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
          <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
        </svg>
      </div>
      <!-- Model quick switcher -->
      <div class="relative min-w-0">
        <button
          class="flex items-center gap-1.5 font-medium hover:text-accent transition-colors min-w-0
            {modelSwitcherOpen ? 'text-accent' : 'text-text-secondary'}"
          style="font-size: {$settings.aiChatFontSize + 1}px;"
          onclick={() => modelSwitcherOpen = !modelSwitcherOpen}
        >
          <span class="truncate">{modelDisplayName($settings.aiModel)}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="shrink-0 opacity-50">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {#if modelSwitcherOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => modelSwitcherOpen = false}></div>
          <div class="absolute top-full left-0 mt-2 z-50 min-w-[240px] max-w-[320px]
            bg-bg-secondary border border-border/50 rounded-lg shadow-2xl shadow-black/40 overflow-hidden">
            {#if $settings.aiFavoriteModels.length > 0}
              <div class="px-3 pt-2.5 pb-1 text-text-muted uppercase tracking-wider font-medium" style="font-size: {$settings.aiChatFontSize - 2}px;">Favorites</div>
              {#each $settings.aiFavoriteModels as fav}
                <button
                  class="w-full text-left px-3 py-2.5 font-mono hover:bg-bg-hover transition-colors truncate
                    {fav === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                    style="font-size: {$settings.aiChatFontSize}px;"
                  onclick={() => { updateSetting("aiModel", fav); modelSwitcherOpen = false; }}
                >
                  {fav}
                </button>
              {/each}
            {:else}
              <div class="px-3 py-3 text-text-muted" style="font-size: {$settings.aiChatFontSize - 2}px;">Star models in Settings to add favorites</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-0.5 shrink-0 ml-2">
      <button
        class="h-8 rounded-md px-2 text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all whitespace-nowrap"
        style="font-size: {$settings.aiChatFontSize - 2}px;"
        onclick={cycleDock}
        title="Toggle chat dock"
      >
        {nextDockLabel()}
      </button>
      <button
        class="h-8 w-8 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all flex items-center justify-center"
        onclick={handleNewChat}
        title="New chat"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Context bar -->
  <div class="border-b border-border/30 bg-bg-secondary/45" style="padding: 8px 12px;">
    <div class="flex items-center" style="gap: 8px;">
      <div class="flex-1 min-w-0">
        <div class="h-1.5 rounded-full bg-bg-active overflow-hidden">
          <div class="h-full rounded-full bg-accent/80 transition-all duration-300" style={`width: ${contextProgressWidth()};`}></div>
        </div>
        <div class="mt-1 flex items-center gap-2 text-text-muted" style="font-size: {$settings.aiChatFontSize - 3}px;">
          <span class="shrink-0">{contextPercentText()}</span>
          <span class="font-mono truncate">{contextTokenText()}</span>
        </div>
      </div>
      <button
        class="rounded-md shrink-0 whitespace-nowrap border border-border/40 bg-bg-secondary/60 text-text-muted hover:text-text-primary hover:bg-bg-hover/60 hover:border-border/60 transition-all"
        style="font-size: {$settings.aiChatFontSize - 3}px; height: 28px; padding: 0 10px;"
        onclick={handleCompactNow}
        disabled={$chatIsLoading}
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
    {#if $chatMessages.length === 0}
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
        {#each $chatMessages as message (message.id)}
          <ChatMessage {message} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Confirmation banner -->
  {#if $pendingConfirmation}
    <div class="mx-3 mb-2 p-3 rounded-lg border border-warning/25 bg-warning/8">
      <div class="flex items-center gap-2 mb-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-warning shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span class="text-text-primary font-medium" style="font-size: {$settings.aiChatFontSize - 1}px;">{$pendingConfirmation.toolName}</span>
      </div>
      <div class="text-text-muted font-mono mb-2.5 max-h-20 overflow-auto pl-[22px]" style="font-size: {$settings.aiChatFontSize - 2}px;">{$pendingConfirmation.arguments}</div>
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
    isLoading={$chatIsLoading}
    disabled={!getActiveAIKey($settings)}
  />
</div>
