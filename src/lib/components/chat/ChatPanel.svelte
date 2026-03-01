<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import {
    chatMessages, chatIsLoading, clearChat, addUIMessage, addStreamingMessage,
    appendToStreamingMessage, finalizeMessage, addToolCallToMessage,
    updateToolCallStatus, pendingConfirmation,
    type PendingConfirmation, type UIToolCall,
  } from '$lib/stores/chat';
import { chatPanelDock } from '$lib/stores/chat';
import { settings, updateSetting } from '$lib/stores/settings';
import { ChatEngine } from '$lib/ai/chat/chat-engine';
import { ChatSession } from '$lib/ai/chat/session';
import type { AIChatSettings, ToolCall, ToolResult, ContextUsage } from '$lib/ai/types';
import { refreshMcpToolDefinitions } from '$lib/ai/tools/mcp-registry';
import { availableModels } from '$lib/stores/models';

  let messagesContainer: HTMLDivElement;
  let engine: ChatEngine | null = null;
  let currentStreamingId: string | null = null;
  let modelSwitcherOpen = $state(false);
  let contextUsage = $state<ContextUsage | null>(null);

  function getAISettings(): AIChatSettings {
    const s = get(settings);
    const model = get(availableModels).find((m) => m.id === s.aiModel);
    return {
      apiKey: s.aiApiKey.trim(),
      model: s.aiModel,
      baseUrl: s.aiBaseUrl.trim().replace(/\/+$/, ''),
      temperature: s.aiTemperature,
      maxTokens: s.aiMaxTokens,
      contextWindow: model?.context_length || 128000,
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
      slashCommandName?: string;
      slashCommandPrompt?: string;
      slashCommandArgs?: string;
    },
  ) {
    if (!message.trim()) return;
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
    if ($settings.aiYoloMode && $pendingConfirmation) {
      handleConfirm(true);
    }
  });

  $effect(() => {
    $settings.aiModel;
    $settings.aiMaxTokens;
    if (engine) {
      engine.updateSettings(getAISettings());
      contextUsage = engine.getContextUsage();
    }
  });

  function modelDisplayName(model: string): string {
    return model.split('/').pop() || model;
  }

  function contextText(): string {
    if (!contextUsage) return 'Context --';
    const remainingPct = Math.max(0, 100 - contextUsage.usedPercent);
    return `Context ${remainingPct.toFixed(0)}% left`;
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

<div class="flex flex-col h-full metal-frame rounded-xl overflow-hidden panel-lift" style="font-size: calc(15px * var(--ui-zoom));">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 h-[52px] shrink-0 border-b border-border/40 bg-bg-secondary/65 backdrop-blur-sm metal-sheen">
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
          <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
        </svg>
      </div>
      <!-- Model quick switcher -->
      <div class="relative min-w-0">
        <button
          class="flex items-center gap-1.5 font-medium hover:text-accent transition-colors min-w-0
            {modelSwitcherOpen ? 'text-accent' : 'text-text-secondary'}"
          style="font-size: calc(16.5px * var(--ui-zoom));"
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
              <div class="px-3 pt-2.5 pb-1 text-text-muted uppercase tracking-wider font-medium" style="font-size: calc(13px * var(--ui-zoom));">Favorites</div>
              {#each $settings.aiFavoriteModels as fav}
                <button
                  class="w-full text-left px-3 py-2.5 font-mono hover:bg-bg-hover transition-colors truncate
                    {fav === $settings.aiModel ? 'text-accent bg-accent/8' : 'text-text-secondary hover:text-text-primary'}"
                  style="font-size: calc(15px * var(--ui-zoom));"
                  onclick={() => { updateSetting("aiModel", fav); modelSwitcherOpen = false; }}
                >
                  {fav}
                </button>
              {/each}
            {:else}
              <div class="px-3 py-3 text-text-muted" style="font-size: calc(13px * var(--ui-zoom));">Star models in Settings to add favorites</div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="text-text-muted shrink-0" style="font-size: calc(12.5px * var(--ui-zoom));">
        {contextText()}
      </div>
    </div>
    <div class="flex items-center gap-1">
      <button
        class="h-10 rounded-md px-3 text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all"
        style="font-size: calc(13px * var(--ui-zoom));"
        onclick={handleCompactNow}
        disabled={$chatIsLoading}
        title="Compact context now"
      >
        Compact
      </button>
      <button
        class="h-10 rounded-md px-3 text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all"
        style="font-size: calc(13px * var(--ui-zoom));"
        onclick={cycleDock}
        title="Toggle chat dock"
      >
        {nextDockLabel()}
      </button>
      <button
        class="w-10 h-10 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover/60 transition-all flex items-center justify-center"
        onclick={handleNewChat}
        title="New Chat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto metal-inset mx-2 mt-2 rounded-lg"
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
          <div class="text-text-secondary font-medium" style="font-size: calc(18px * var(--ui-zoom));">Ask about your workspace</div>
          <div class="text-text-muted leading-relaxed max-w-[280px]" style="font-size: calc(15px * var(--ui-zoom));">
            Read files, search code, edit files, and run commands
          </div>
        </div>
      </div>
    {:else}
      <div class="py-3">
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
        <span class="text-text-primary font-medium" style="font-size: calc(14px * var(--ui-zoom));">{$pendingConfirmation.toolName}</span>
      </div>
      <div class="text-text-muted font-mono mb-2.5 max-h-20 overflow-auto pl-[22px]" style="font-size: calc(13px * var(--ui-zoom));">{$pendingConfirmation.arguments}</div>
      <div class="flex gap-2 pl-[22px]">
        <button
          class="px-3 py-1.5 rounded-md bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity"
          style="font-size: calc(13px * var(--ui-zoom));"
          onclick={() => handleConfirm(true)}
        >Allow</button>
        <button
          class="px-3 py-1.5 rounded-md border border-border/60 text-text-muted hover:text-text-primary hover:border-border transition-colors"
          style="font-size: calc(13px * var(--ui-zoom));"
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
    disabled={!$settings.aiApiKey}
  />
</div>
