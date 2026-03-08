<script lang="ts">
  import {
    chatInstances,
    bottomChats,
    rightChats,
    activeBottomChatId,
    activeRightChatId,
    addChat,
    removeChat,
    moveChat,
    updateChatTitle,
    type ChatDock,
  } from '$lib/stores/chat-instances';
  import { settings } from '$lib/stores/settings';
  import ChatPanel from './ChatPanel.svelte';
  import { destroyInstanceState } from '$lib/stores/chat-instance-state';

  interface Props {
    dock: ChatDock;
  }

  let { dock }: Props = $props();

  let instances = $derived(dock === 'right' ? $rightChats : $bottomChats);
  let currentActiveId = $derived(
    dock === 'right' ? $activeRightChatId : $activeBottomChatId
  );

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; chatId: string } | null>(null);
  // Rename state
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInput = $state<HTMLInputElement | null>(null);

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

  function handleTabContextMenu(e: MouseEvent, chatId: string) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, chatId };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleCloseChat(chatId: string) {
    destroyInstanceState(chatId);
    removeChat(chatId);
    closeContextMenu();
  }

  function handleCloseOtherChats(chatId: string) {
    const toClose = instances.filter(i => i.id !== chatId);
    for (const inst of toClose) {
      destroyInstanceState(inst.id);
      removeChat(inst.id);
    }
    closeContextMenu();
  }

  function handleCloseAllChats() {
    const toClose = [...instances];
    for (const inst of toClose) {
      destroyInstanceState(inst.id);
      removeChat(inst.id);
    }
    closeContextMenu();
  }

  function handleMoveTo(chatId: string, newDock: ChatDock) {
    moveChat(chatId, newDock);
    closeContextMenu();
  }

  function startRename(chatId: string) {
    const inst = instances.find(i => i.id === chatId);
    if (!inst) return;
    renamingId = chatId;
    renameValue = inst.title;
    closeContextMenu();
    // Focus the input after it renders
    setTimeout(() => renameInput?.focus(), 0);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      updateChatTitle(renamingId, renameValue.trim());
    }
    renamingId = null;
    renameValue = '';
  }

  function cancelRename() {
    renamingId = null;
    renameValue = '';
  }
</script>

<div class="flex flex-col h-full">
  <!-- Tab bar (always shown when chats exist) -->
  {#if instances.length >= 1}
    <div class="flex items-center border-b border-border/20 shrink-0" style="min-height: 36px; padding: 0 8px; gap: 2px; background: rgba(0,0,0,0.12);">
      {#each instances as inst (inst.id)}
        {#if renamingId === inst.id}
          <input
            bind:this={renameInput}
            bind:value={renameValue}
            class="bg-bg-primary border border-accent/50 rounded-md text-text-primary outline-none"
            style="font-size: {Math.max(10, $settings.aiChatFontSize - 2)}px; padding: 4px 8px; margin-top: 3px; width: 100px;"
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelRename();
            }}
            onblur={commitRename}
          />
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <button
            class="flex items-center rounded-md transition-all whitespace-nowrap
              {currentActiveId === inst.id ? 'text-text-primary' : 'text-text-muted/60 hover:text-text-secondary hover:bg-white/4'}"
            style="font-size: {Math.max(10, $settings.aiChatFontSize - 2)}px; padding: 5px 10px; gap: 6px; {currentActiveId === inst.id ? 'background: rgba(255,255,255,0.06);' : ''}"
            onclick={() => setActiveId(inst.id)}
            oncontextmenu={(e) => handleTabContextMenu(e, inst.id)}
            ondblclick={() => startRename(inst.id)}
          >
            <span class="shrink-0 rounded-full" style="width: 6px; height: 6px; {currentActiveId === inst.id ? 'background: var(--color-accent); box-shadow: 0 0 6px var(--color-accent);' : 'background: rgba(255,255,255,0.15);'}"></span>
            <span class="truncate" style="max-width: 140px;">{inst.title}</span>
            <!-- Close X on active tab -->
            {#if currentActiveId === inst.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <span
                role="button"
                tabindex="-1"
                class="shrink-0 rounded text-text-muted/40 hover:text-error transition-colors flex items-center justify-center cursor-pointer"
                style="width: 16px; height: 16px; margin-left: 2px;"
                onclick={(e) => { e.stopPropagation(); handleCloseChat(inst.id); }}
                title="Close"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </span>
            {/if}
          </button>
        {/if}
      {/each}
      <button
        class="text-text-muted/40 hover:text-text-primary hover:bg-white/5 transition-all rounded-md flex items-center justify-center"
        style="width: 26px; height: 26px; margin-left: 4px;"
        onclick={handleNewChat}
        title="New Chat (Ctrl+L)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  {/if}

  <!-- Right-click context menu -->
  {#if contextMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50" onclick={closeContextMenu} oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}></div>
    <div
      class="fixed z-50 bg-bg-secondary border border-border/50 rounded-lg shadow-2xl shadow-black/40 overflow-hidden"
      style="top: {contextMenu.y}px; left: {contextMenu.x}px; min-width: 180px;"
    >
      <button
        class="w-full text-left text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
        onclick={() => { startRename(contextMenu!.chatId); }}
      >Rename</button>
      <div class="border-t border-border/20"></div>
      {#if dock !== 'right'}
        <button
          class="w-full text-left text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
          onclick={() => handleMoveTo(contextMenu!.chatId, 'right')}
        >Move to Right</button>
      {/if}
      {#if dock !== 'bottom'}
        <button
          class="w-full text-left text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
          onclick={() => handleMoveTo(contextMenu!.chatId, 'bottom')}
        >Move to Bottom</button>
      {/if}
      <button
        class="w-full text-left text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
        onclick={() => handleMoveTo(contextMenu!.chatId, 'tab')}
      >Move to Tab</button>
      <div class="border-t border-border/20"></div>
      <button
        class="w-full text-left text-text-secondary hover:text-error hover:bg-error/8 transition-colors"
        style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
        onclick={() => handleCloseChat(contextMenu!.chatId)}
      >Close</button>
      {#if instances.length > 1}
        <button
          class="w-full text-left text-text-secondary hover:text-error hover:bg-error/8 transition-colors"
          style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
          onclick={() => handleCloseOtherChats(contextMenu!.chatId)}
        >Close Others</button>
        <button
          class="w-full text-left text-text-secondary hover:text-error hover:bg-error/8 transition-colors"
          style="padding: 7px 14px; font-size: {$settings.aiChatFontSize - 1}px;"
          onclick={handleCloseAllChats}
        >Close All</button>
      {/if}
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
