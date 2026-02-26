<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import ChatMessage from './ChatMessage.svelte';
  import ChatInput from './ChatInput.svelte';
  import {
    chatMessages, chatIsLoading, clearChat, addUIMessage, addStreamingMessage,
    appendToStreamingMessage, finalizeMessage, addToolCallToMessage,
    updateToolCallStatus, pendingConfirmation,
    type PendingConfirmation, type UIToolCall,
  } from '$lib/stores/chat';
  import { settings, updateSetting } from '$lib/stores/settings';
  import { ChatEngine } from '$lib/ai/chat/chat-engine';
  import { ChatSession } from '$lib/ai/chat/session';
  import type { AIChatSettings, ToolCall, ToolResult } from '$lib/ai/types';

  let messagesContainer: HTMLDivElement;
  let engine: ChatEngine | null = null;
  let currentStreamingId: string | null = null;
  let modelSwitcherOpen = $state(false);

  function getAISettings(): AIChatSettings {
    const s = get(settings);
    return {
      apiKey: s.aiApiKey.trim(),
      model: s.aiModel,
      baseUrl: s.aiBaseUrl.trim().replace(/\/+$/, ''),
      temperature: s.aiTemperature,
      maxTokens: s.aiMaxTokens,
      enableToolUse: s.aiEnableToolUse,
      confirmWrites: s.aiConfirmWrites,
      maxToolIterations: s.aiMaxToolIterations,
    };
  }

  function initEngine(): ChatEngine {
    const session = new ChatSession();
    const aiSettings = getAISettings();

    return new ChatEngine(session, aiSettings, {
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
          // Finalize current message and start a new streaming message for next iteration
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
      onDone: (_fullContent: string) => {
        if (currentStreamingId) {
          // If the streaming message is empty (e.g. created by onToolResult but AI had no more text),
          // remove it instead of leaving an empty bubble
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
            // Provide friendlier messages for common errors, but include details
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
  }

  async function handleSend(message: string) {
    if (!message.trim()) return;
    if (get(chatIsLoading)) return; // prevent sending while streaming

    const aiSettings = getAISettings();
    if (!aiSettings.apiKey) return;

    // Initialize engine if needed
    if (!engine) {
      engine = initEngine();
    }
    engine.updateSettings(getAISettings());

    // Add user message to UI
    addUIMessage('user', message);

    // Start streaming response
    chatIsLoading.set(true);
    currentStreamingId = addStreamingMessage();
    scrollToBottom();

    await engine.sendMessage(message);
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

  // Cleanup engine on component destroy
  onDestroy(() => {
    if (engine) {
      engine.abort();
    }
  });

  // Auto-scroll when messages change
  $effect(() => {
    $chatMessages;
    scrollToBottom();
  });
</script>

<div class="flex flex-col h-full bg-bg-primary/60 backdrop-blur-sm">
  <!-- Header -->
  <div class="flex items-center justify-between px-5 py-4 border-b border-border/50">
    <div class="flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-accent shrink-0">
        <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
      </svg>
      <!-- Model quick switcher -->
      <div class="relative">
        <button
          class="flex items-center gap-1 text-text-primary text-sm font-medium hover:text-accent transition-colors"
          onclick={() => modelSwitcherOpen = !modelSwitcherOpen}
        >
          <span class="truncate max-w-[180px]">{$settings.aiModel.split('/').pop()}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0 text-text-muted">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {#if modelSwitcherOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => modelSwitcherOpen = false}></div>
          <div class="absolute top-full left-0 mt-1 z-50 min-w-[220px] max-w-[300px] bg-bg-secondary border border-border/60 rounded-lg shadow-xl overflow-hidden">
            {#if $settings.aiFavoriteModels.length > 0}
              <div class="px-2.5 pt-2 pb-1 text-text-muted text-[10px] uppercase tracking-wider">Favorites</div>
              {#each $settings.aiFavoriteModels as fav}
                <button
                  class="w-full text-left px-3 py-1.5 text-[12px] font-mono hover:bg-bg-hover transition-colors truncate
                    {fav === $settings.aiModel ? 'text-accent bg-accent/10' : 'text-text-primary'}"
                  onclick={() => { updateSetting("aiModel", fav); modelSwitcherOpen = false; }}
                >
                  {fav}
                </button>
              {/each}
            {:else}
              <div class="px-3 py-2 text-text-muted text-[11px]">Star models in Settings to add favorites</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <button
      class="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-bg-hover"
      onclick={handleNewChat}
      title="New Chat"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto px-5 py-5 space-y-4"
    bind:this={messagesContainer}
  >
    {#if $chatMessages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-text-muted text-sm gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="opacity-30">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Ask anything about your workspace</span>
      </div>
    {:else}
      {#each $chatMessages as message (message.id)}
        <ChatMessage {message} />
      {/each}
    {/if}
  </div>

  <!-- Confirmation banner -->
  {#if $pendingConfirmation}
    <div class="mx-4 mb-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
      <div class="text-text-primary text-sm font-medium mb-1">Confirm: {$pendingConfirmation.toolName}</div>
      <div class="text-text-muted text-xs font-mono mb-2 max-h-20 overflow-auto">{$pendingConfirmation.arguments}</div>
      <div class="flex gap-2">
        <button
          class="px-3 py-1 text-xs rounded bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity"
          onclick={() => handleConfirm(true)}
        >Allow</button>
        <button
          class="px-3 py-1 text-xs rounded border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
          onclick={() => handleConfirm(false)}
        >Deny</button>
      </div>
    </div>
  {/if}

  <!-- Input -->
  <ChatInput
    onSend={handleSend}
    onStop={handleStop}
    isLoading={$chatIsLoading}
    disabled={!$settings.aiApiKey}
  />
</div>
