<script lang="ts">
  import { settingsVisible } from "$lib/stores/settings";

  interface Props {
    activeView: "explorer" | "search";
    onViewChange: (view: "explorer" | "search") => void;
  }

  let { activeView, onViewChange }: Props = $props();
</script>

<div class="icon-rail flex flex-col items-center shrink-0">
  <!-- Top icons -->
  <div class="flex flex-col items-center gap-1 mt-1">
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
  </div>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Bottom icons -->
  <div class="flex flex-col items-center gap-1 mb-2">
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
    width: 48px;
    background: rgba(10, 11, 16, 0.6);
    border-right: 1px solid var(--color-border);
  }

  .rail-icon {
    width: 36px;
    height: 36px;
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
    background: rgba(0, 212, 255, 0.06);
  }

  .rail-icon.active {
    color: var(--color-accent);
    background: rgba(0, 212, 255, 0.1);
  }

  .rail-icon.active::before {
    content: "";
    position: absolute;
    left: -6px;
    top: 25%;
    bottom: 25%;
    width: 3px;
    background: var(--color-accent);
    border-radius: 0 2px 2px 0;
  }
</style>
