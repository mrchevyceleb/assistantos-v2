<script lang="ts">
  import {
    activeBrowserId,
    activeRightBrowserId,
    bottomBrowsers,
    rightBrowsers,
    addBrowser,
    removeBrowser,
  } from "$lib/stores/browser";
  import BrowserView from "./BrowserView.svelte";

  interface Props {
    dock: "bottom" | "right";
  }

  let { dock }: Props = $props();

  let instances = $derived(dock === "right" ? $rightBrowsers : $bottomBrowsers);
  let currentActiveId = $derived(
    dock === "right" ? $activeRightBrowserId : $activeBrowserId
  );

  function setActiveId(id: string) {
    if (dock === "right") {
      activeRightBrowserId.set(id);
    } else {
      activeBrowserId.set(id);
    }
  }

  function handleNewBrowser() {
    addBrowser("https://www.google.com", dock);
  }
</script>

<div class="browser-panel" style="display: flex; flex-direction: column; height: 100%;">
  <!-- Tab bar -->
  <div class="browser-tabbar" style="display: flex; align-items: center; min-height: 36px; padding: 0 6px; gap: 2px;">
    {#each instances as inst (inst.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="browser-tab group"
        class:active={currentActiveId === inst.id}
        onclick={() => setActiveId(inst.id)}
        role="tab"
        tabindex="0"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="browser-tab-icon">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span class="browser-tab-label">{inst.title}</span>

        {#if inst.isLoading}
          <span class="browser-tab-loading"></span>
        {/if}

        <!-- Close button -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span
          class="browser-tab-close"
          onclick={(e) => { e.stopPropagation(); removeBrowser(inst.id); }}
          role="button"
          tabindex="0"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </div>
    {/each}

    <button
      class="browser-new-btn"
      onclick={handleNewBrowser}
      title="New Browser"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  <!-- Browser instances -->
  <div style="flex: 1; position: relative; overflow: hidden;">
    {#each instances as inst (inst.id)}
      <div
        style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;"
        class:hidden={currentActiveId !== inst.id}
      >
        <BrowserView
          instanceId={inst.id}
          dock={dock}
          isVisible={currentActiveId === inst.id}
        />
      </div>
    {/each}

    {#if instances.length === 0}
      <div style="display: flex; align-items: center; justify-content: center; height: 100%;">
        <button class="browser-empty-btn" onclick={handleNewBrowser}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.6;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          New Browser
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-panel {
    background: #08090e;
  }

  .browser-tabbar {
    background:
      linear-gradient(180deg, rgba(57, 64, 80, 0.76) 0%, rgba(20, 24, 35, 0.92) 52%, rgba(11, 13, 19, 0.96) 100%),
      repeating-linear-gradient(95deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 2px, rgba(0, 0, 0, 0.012) 2px, rgba(0, 0, 0, 0.012) 4px);
    border-bottom: 1px solid #293246;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -2px 0 rgba(0, 0, 0, 0.5);
  }

  .browser-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    border-radius: 6px 6px 0 0;
    margin-top: 3px;
    position: relative;
    white-space: nowrap;
  }

  .browser-tab:hover {
    color: var(--color-text-secondary);
    background: linear-gradient(180deg, rgba(34, 39, 56, 0.56) 0%, rgba(14, 17, 27, 0.65) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  .browser-tab.active {
    color: var(--color-text-primary);
    background:
      linear-gradient(180deg, rgba(63, 71, 90, 0.76) 0%, rgba(26, 31, 44, 0.95) 46%, rgba(13, 16, 26, 0.98) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      inset 0 -1px 0 rgba(0, 0, 0, 0.66);
  }

  .browser-tab.active::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 8px;
    right: 8px;
    height: 3px;
    background: var(--color-accent);
    border-radius: 2px 2px 0 0;
  }

  .browser-tab-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .browser-tab.active .browser-tab-icon {
    opacity: 0.8;
    color: var(--color-accent);
  }

  .browser-tab-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browser-tab-loading {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: browser-panel-pulse 1s ease-in-out infinite;
  }

  @keyframes browser-panel-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .browser-tab-close {
    padding: 2px;
    border-radius: 3px;
    opacity: 0;
    transition: all 0.1s;
    cursor: pointer;
    margin-left: 2px;
  }

  .browser-tab-close:hover {
    background: rgba(243, 139, 168, 0.2);
    color: var(--color-error);
  }

  :global(.group:hover) .browser-tab-close {
    opacity: 1;
  }

  .browser-new-btn {
    color: var(--color-text-muted);
    padding: 5px 8px;
    transition: all 0.15s;
    border-radius: 4px;
    margin-left: 2px;
    background: none;
    border: none;
    cursor: pointer;
  }

  .browser-new-btn:hover {
    color: var(--color-text-primary);
    background: #13131f;
  }

  .browser-empty-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px dashed #1a1a2e;
    transition: all 0.2s;
    background: transparent;
    cursor: pointer;
  }

  .browser-empty-btn:hover {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: rgba(88, 180, 208, 0.05);
  }
</style>
