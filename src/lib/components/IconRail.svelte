<script lang="ts">
  import { settingsVisible, aiSettingsVisible, settings } from "$lib/stores/settings";
  import { chatInstances, chatVisible, addChat } from "$lib/stores/chat-instances";
  import { get } from "svelte/store";

  interface Props {
    activeView: "explorer" | "search";
    onViewChange: (view: "explorer" | "search") => void;
  }

  let { activeView, onViewChange }: Props = $props();
</script>

<div class="icon-rail flex flex-col items-center shrink-0">
  <!-- Top icons -->
  <div class="flex flex-col items-center gap-2 mt-2">
    <!-- Explorer -->
    <button
      class="rail-icon"
      class:active={activeView === "explorer"}
      onclick={() => onViewChange("explorer")}
      title="Explorer (Ctrl+B)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </button>

    <!-- Search -->
    <button
      class="rail-icon"
      class:active={activeView === "search"}
      onclick={() => onViewChange("search")}
      title="Search (Ctrl+Shift+F)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </button>
    <!-- AI Chat -->
    <button
      class="rail-icon"
      class:active={$chatVisible && $chatInstances.length > 0}
      onclick={() => {
        const instances = get(chatInstances);
        const hasPanel = instances.some((c) => c.dock === 'right' || c.dock === 'bottom');
        if (hasPanel) {
          chatVisible.update((v) => !v);
        } else {
          const s = get(settings);
          addChat(s.aiModel, s.aiProvider, s.aiChatDock === 'tab' ? 'right' : s.aiChatDock);
        }
      }}
      title="AI Chat (Ctrl+L)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
      </svg>
    </button>

    <!-- AI Settings -->
    <button
      class="rail-icon"
      class:active={$aiSettingsVisible}
      onclick={() => {
        settingsVisible.set(false);
        aiSettingsVisible.update((v) => !v);
      }}
      title="AI & Models Settings"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/>
        <circle cx="12" cy="14" r="2"/>
        <path d="M12 12v-2"/>
      </svg>
    </button>
  </div>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Bottom icons -->
  <div class="flex flex-col items-center gap-2 mb-3">
    <!-- Settings -->
    <button
      class="rail-icon"
      onclick={() => settingsVisible.update((v) => !v)}
      title="Settings (Ctrl+,)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .icon-rail {
    width: 56px;
    background: linear-gradient(
      180deg,
      rgba(16, 18, 26, 0.9) 0%,
      rgba(10, 11, 16, 0.95) 100%
    );
    border-right: 1px solid var(--color-border);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.02),
                1px 0 8px rgba(0, 0, 0, 0.3);
  }

  .rail-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }

  .rail-icon:hover {
    color: var(--color-text-secondary);
    background: rgba(88, 180, 208, 0.06);
  }

  .rail-icon.active {
    color: var(--color-accent);
    background: rgba(88, 180, 208, 0.1);
  }

  .rail-icon.active::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 25%;
    bottom: 25%;
    width: 3px;
    background: var(--color-accent);
    border-radius: 0 2px 2px 0;
  }
</style>
