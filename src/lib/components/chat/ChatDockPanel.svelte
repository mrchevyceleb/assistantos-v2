<script lang="ts">
  import {
    chatInstances,
    bottomChats,
    rightChats,
    activeBottomChatId,
    activeRightChatId,
    addChat,
    type ChatDock,
  } from '$lib/stores/chat-instances';
  import { settings } from '$lib/stores/settings';
  import ChatPanel from './ChatPanel.svelte';

  interface Props {
    dock: ChatDock;
  }

  let { dock }: Props = $props();

  let instances = $derived(dock === 'right' ? $rightChats : $bottomChats);
  let currentActiveId = $derived(
    dock === 'right' ? $activeRightChatId : $activeBottomChatId
  );

  function setActiveId(id: string) {
    if (dock === 'right') {
      activeRightChatId.set(id);
    } else {
      activeBottomChatId.set(id);
    }
  }

  function handleNewChat() {
    const s = $settings;
    addChat(s.aiModel, s.aiProvider, dock);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Tab bar (always shown when chats exist) -->
  {#if instances.length >= 1}
    <div class="flex items-center border-b border-border/30 bg-bg-secondary/50 shrink-0" style="min-height: 34px; padding: 0 6px; gap: 2px;">
      {#each instances as inst (inst.id)}
        <button
          class="flex items-center gap-1.5 rounded-t-md transition-colors whitespace-nowrap
            {currentActiveId === inst.id ? 'text-text-primary bg-bg-secondary/80 border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/30'}"
          style="font-size: {$settings.aiChatFontSize - 2}px; padding: 5px 12px; margin-top: 3px;"
          onclick={() => setActiveId(inst.id)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 opacity-60">
            <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
          </svg>
          <span class="truncate" style="max-width: 120px;">{inst.title}</span>
        </button>
      {/each}
      <button
        class="text-text-muted hover:text-text-primary transition-colors rounded-md flex items-center justify-center"
        style="width: 28px; height: 28px; margin-left: 2px;"
        onclick={handleNewChat}
        title="New Chat (Ctrl+L)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  {/if}

  <!-- Chat panels: always mounted to preserve engine state, hidden via CSS -->
  <div class="flex-1 relative overflow-hidden">
    {#each instances as inst (inst.id)}
      <div
        class="absolute inset-0"
        class:hidden={currentActiveId !== inst.id}
      >
        <ChatPanel instanceId={inst.id} />
      </div>
    {/each}

    {#if instances.length === 0}
      <div class="flex items-center justify-center h-full">
        <button
          onclick={handleNewChat}
          class="flex items-center gap-2 text-text-muted hover:text-accent transition-colors border border-dashed border-border/30 hover:border-accent/30 rounded-lg"
          style="font-size: {$settings.aiChatFontSize}px; padding: 12px 24px;"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-60">
            <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
          </svg>
          New Chat
        </button>
      </div>
    {/if}
  </div>
</div>
