<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import {
    browserInstances,
    browserBookmarks,
    navigateBrowserTo,
    browserGoBack,
    browserGoForward,
    setBrowserLoading,
    updateBrowserUrl,
    moveBrowser,
    removeBrowser,
    addBookmark,
    removeBookmarkByUrl,
    type BrowserDock,
  } from "$lib/stores/browser";
  import {
    createBrowserWebview,
    navigateBrowser as navigateBrowserCmd,
    setBrowserBounds,
    showBrowser,
    hideBrowser,
    closeBrowserWebview,
    reloadBrowser,
  } from "$lib/utils/tauri";
  import { settingsVisible, aiSettingsVisible } from "$lib/stores/settings";

  interface Props {
    instanceId: string;
    dock?: BrowserDock;
    isVisible?: boolean;
  }

  let { instanceId, dock = "tab", isVisible = true }: Props = $props();

  let webviewHostRef: HTMLDivElement | undefined = $state();
  let urlInput = $state("");
  let webviewCreated = $state(false);
  let webviewCreating = false; // semaphore to prevent double-creation
  let webviewError = $state<string | null>(null);
  let mounted = $state(false);
  let resizeObserver: ResizeObserver | null = null;
  let unlistenPageLoad: UnlistenFn | null = null;

  // Serialize all webview operations through a promise chain
  let webviewOp = Promise.resolve();

  let instance = $derived(
    $browserInstances.find((b) => b.id === instanceId)
  );

  let canGoBack = $derived(instance ? instance.historyIndex > 0 : false);
  let canGoForward = $derived(
    instance ? instance.historyIndex < instance.history.length - 1 : false
  );
  let currentIsBookmarked = $derived(
    instance ? $browserBookmarks.some((b) => b.url === instance!.url) : false
  );

  function toggleBookmark() {
    if (!instance) return;
    if (currentIsBookmarked) {
      removeBookmarkByUrl(instance.url);
    } else {
      // Use a shortened title from the URL
      let title: string;
      try {
        const urlObj = new URL(instance.url);
        const host = urlObj.hostname.replace(/^www\./, "");
        const path = urlObj.pathname !== "/" ? urlObj.pathname.slice(0, 20) : "";
        title = host + path;
      } catch {
        title = instance.url.slice(0, 30);
      }
      addBookmark(title, instance.url);
    }
  }

  function navigateToBookmark(url: string) {
    if (!instance) return;
    navigateBrowserTo(instanceId, url);
    urlInput = url;
    webviewOp = webviewOp.then(async () => {
      try {
        await navigateBrowserCmd(instanceId, url);
      } catch { /* ok */ }
    });
  }

  function ensureProtocol(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    // Block dangerous protocols
    if (/^javascript:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) {
      return "";
    }
    if (/^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed) || /^asset:\/\//i.test(trimmed)) {
      return trimmed;
    }
    // If it looks like a URL (has a dot and no spaces), add https
    if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
      return `https://${trimmed}`;
    }
    // Otherwise treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  function getBounds(): { x: number; y: number; width: number; height: number; scaleFactor: number } | null {
    if (!webviewHostRef) return null;
    const rect = webviewHostRef.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      scaleFactor: window.devicePixelRatio || 1,
    };
  }

  async function createWebview() {
    if (!instance || webviewCreated || webviewCreating) return;
    const bounds = getBounds();
    if (!bounds) return;
    const url = instance.url; // capture before async
    webviewCreating = true;

    webviewOp = webviewOp.then(async () => {
      try {
        await createBrowserWebview(instanceId, url, bounds);
        webviewCreated = true;
        webviewError = null;
      } catch (e) {
        console.error("Failed to create browser webview:", e);
        webviewError = String(e);
      } finally {
        webviewCreating = false;
      }
    });
    await webviewOp;
  }

  async function destroyWebview() {
    webviewOp = webviewOp.then(async () => {
      try {
        await closeBrowserWebview(instanceId);
      } catch { /* ok */ }
      webviewCreated = false;
    });
    await webviewOp;
  }

  function handleNavigate() {
    const url = ensureProtocol(urlInput);
    if (!url || !instance) return;

    navigateBrowserTo(instanceId, url);
    urlInput = url;

    webviewOp = webviewOp.then(async () => {
      try {
        await navigateBrowserCmd(instanceId, url);
      } catch (e) {
        console.error("Navigation failed:", e);
      }
    });
  }

  function handleBack() {
    const url = browserGoBack(instanceId);
    if (url) {
      urlInput = url;
      webviewOp = webviewOp.then(async () => {
        try {
          await navigateBrowserCmd(instanceId, url);
        } catch { /* ok */ }
      });
    }
  }

  function handleForward() {
    const url = browserGoForward(instanceId);
    if (url) {
      urlInput = url;
      webviewOp = webviewOp.then(async () => {
        try {
          await navigateBrowserCmd(instanceId, url);
        } catch { /* ok */ }
      });
    }
  }

  function handleRefresh() {
    webviewOp = webviewOp.then(async () => {
      try {
        await reloadBrowser(instanceId);
      } catch { /* ok */ }
    });
  }

  function handleUrlKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNavigate();
    }
  }

  // Sync URL input with instance URL (only when URL actually changes, not on every store mutation)
  let lastSyncedUrl = "";
  $effect(() => {
    if (instance && instance.url !== lastSyncedUrl) {
      lastSyncedUrl = instance.url;
      urlInput = instance.url;
    }
  });

  // Hide/show webview based on visibility and modals.
  // Also create the webview on first visibility if it wasn't created at mount (hidden tab).
  $effect(() => {
    const visible = isVisible;
    const modalOpen = $settingsVisible || $aiSettingsVisible;

    if (!mounted) return;

    // If becoming visible and webview not yet created, create it now
    if (visible && !modalOpen && !webviewCreated && !webviewError) {
      // Delay one frame for layout
      requestAnimationFrame(() => {
        createWebview();
      });
      return;
    }

    if (!webviewCreated) return;

    webviewOp = webviewOp.then(async () => {
      try {
        if (!visible || modalOpen) {
          await hideBrowser(instanceId);
        } else {
          // Wait a frame for CSS display:none to be removed before reading bounds
          await new Promise((r) => requestAnimationFrame(r));
          await showBrowser(instanceId);
          const bounds = getBounds();
          if (bounds) {
            await setBrowserBounds(instanceId, bounds);
          }
        }
      } catch { /* webview may not exist yet */ }
    });
  });

  onMount(async () => {
    mounted = true;
    // Wait a frame for layout to settle
    await new Promise((r) => requestAnimationFrame(r));

    // Only create webview if currently visible (hidden tabs defer creation)
    if (isVisible) {
      await createWebview();
    }

    // ResizeObserver to keep webview bounds synced
    if (webviewHostRef) {
      resizeObserver = new ResizeObserver(async () => {
        if (!webviewCreated) return;
        const bounds = getBounds();
        if (bounds) {
          webviewOp = webviewOp.then(async () => {
            try {
              await setBrowserBounds(instanceId, bounds);
            } catch { /* ok */ }
          });
        }
      });
      resizeObserver.observe(webviewHostRef);
    }

    // Listen for page load events
    unlistenPageLoad = await listen<{
      event: string;
      url: string;
      browser_id: string;
    }>("browser-page-load", (ev) => {
      if (ev.payload.browser_id !== instanceId) return;

      if (ev.payload.event === "started") {
        setBrowserLoading(instanceId, true);
      } else if (ev.payload.event === "finished") {
        setBrowserLoading(instanceId, false);
        // Update URL from the actual page URL and push to history
        if (ev.payload.url && instance && ev.payload.url !== instance.url) {
          navigateBrowserTo(instanceId, ev.payload.url);
          urlInput = ev.payload.url;
        }
      }
    });
  });

  onDestroy(async () => {
    mounted = false;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (unlistenPageLoad) {
      unlistenPageLoad();
      unlistenPageLoad = null;
    }
    await destroyWebview();
  });
</script>

<div class="browser-view" style="display: flex; flex-direction: column; height: 100%;">
  <!-- Toolbar -->
  <div class="browser-toolbar" style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; min-height: 40px;">
    <!-- Back -->
    <button
      class="browser-btn"
      onclick={handleBack}
      disabled={!canGoBack}
      title="Go back"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- Forward -->
    <button
      class="browser-btn"
      onclick={handleForward}
      disabled={!canGoForward}
      title="Go forward"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>

    <!-- Refresh -->
    <button
      class="browser-btn"
      onclick={handleRefresh}
      title="Refresh"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="browser-refresh-icon">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </button>

    <!-- Loading indicator -->
    {#if instance?.isLoading}
      <div class="browser-loading-dot"></div>
    {/if}

    <!-- URL Bar -->
    <div class="browser-url-bar" style="flex: 1; display: flex; align-items: center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink: 0; opacity: 0.4; margin-right: 6px;">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      <input
        type="text"
        class="browser-url-input"
        bind:value={urlInput}
        onkeydown={handleUrlKeydown}
        placeholder="Enter URL or search..."
        spellcheck="false"
        style="flex: 1; background: none; border: none; outline: none; color: var(--color-text-primary); font-size: 12.5px; font-family: inherit;"
      />
    </div>

    <!-- Bookmark star -->
    <button
      class="browser-btn browser-star-btn"
      class:bookmarked={currentIsBookmarked}
      onclick={toggleBookmark}
      title={currentIsBookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={currentIsBookmarked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </button>

    <!-- Dock move buttons (only show in dock panels, not in tab mode) -->
    {#if dock !== "tab"}
      <span class="browser-dock-btns" style="display: flex; align-items: center; gap: 2px; margin-left: 4px;">
        {#if dock !== "bottom"}
          <button
            class="browser-btn browser-btn-sm"
            onclick={() => moveBrowser(instanceId, "bottom")}
            title="Move to bottom"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
            </svg>
          </button>
        {/if}
        {#if dock !== "right"}
          <button
            class="browser-btn browser-btn-sm"
            onclick={() => moveBrowser(instanceId, "right")}
            title="Move to right"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
        {/if}
        <button
          class="browser-btn browser-btn-sm"
          onclick={() => moveBrowser(instanceId, "tab")}
          title="Open as tab"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
          </svg>
        </button>
      </span>
    {/if}

    <!-- Close (only in dock panels) -->
    {#if dock !== "tab"}
      <button
        class="browser-btn browser-close-btn"
        onclick={() => removeBrowser(instanceId)}
        title="Close browser"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Bookmarks bar -->
  {#if $browserBookmarks.length > 0}
    <div class="browser-bookmarks-bar" style="display: flex; align-items: center; gap: 2px; padding: 2px 8px; min-height: 28px; overflow-x: auto;">
      {#each $browserBookmarks as bm (bm.id)}
        <button
          class="browser-bookmark-chip"
          onclick={() => navigateToBookmark(bm.url)}
          title={bm.url}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink: 0; opacity: 0.5;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span class="browser-bookmark-label">{bm.title}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Webview host (native webview overlays this div) -->
  <div
    bind:this={webviewHostRef}
    class="browser-webview-host"
    style="flex: 1; position: relative; overflow: hidden;"
  >
    {#if webviewError}
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 12px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="1.5" style="opacity: 0.6;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span style="color: var(--color-text-muted); font-size: 13px; max-width: 300px; text-align: center;">Failed to create browser</span>
        <span style="color: var(--color-text-muted); font-size: 11px; opacity: 0.6; max-width: 300px; text-align: center; word-break: break-all;">{webviewError}</span>
        <button
          class="browser-btn"
          style="margin-top: 4px; padding: 6px 16px; font-size: 12px;"
          onclick={() => { webviewError = null; createWebview(); }}
        >Retry</button>
      </div>
    {:else if !webviewCreated}
      <div class="browser-empty" style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 12px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="browser-globe-icon" style="opacity: 0.3;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span style="color: var(--color-text-muted); font-size: 13px;">Loading browser...</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-toolbar {
    background:
      linear-gradient(180deg, rgba(57, 64, 80, 0.76) 0%, rgba(20, 24, 35, 0.92) 52%, rgba(11, 13, 19, 0.96) 100%);
    border-bottom: 1px solid #293246;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -2px 0 rgba(0, 0, 0, 0.5);
  }

  .browser-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    border-radius: 5px;
    color: var(--color-text-muted);
    transition: all 0.15s ease;
    background: none;
    border: none;
    cursor: pointer;
  }

  .browser-btn:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: rgba(255, 255, 255, 0.08);
    transform: scale(1.1);
  }

  .browser-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .browser-btn-sm {
    padding: 3px;
  }

  .browser-close-btn:hover {
    color: var(--color-error) !important;
    background: rgba(243, 139, 168, 0.15) !important;
  }

  .browser-refresh-icon {
    transition: transform 0.3s ease;
  }

  .browser-btn:hover .browser-refresh-icon {
    transform: rotate(180deg);
  }

  .browser-url-bar {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 4px 10px;
    transition: all 0.15s ease;
  }

  .browser-url-bar:focus-within {
    border-color: var(--color-accent);
    background: rgba(0, 0, 0, 0.45);
    box-shadow: 0 0 0 1px rgba(88, 180, 208, 0.2);
  }

  .browser-url-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .browser-loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: browser-pulse 1s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes browser-pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
  }

  .browser-globe-icon {
    animation: browser-breathe 3s ease-in-out infinite;
  }

  @keyframes browser-breathe {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.05); }
  }

  .browser-star-btn {
    color: var(--color-text-muted);
  }

  .browser-star-btn.bookmarked {
    color: #facc15;
  }

  .browser-star-btn:hover {
    color: #facc15 !important;
  }

  .browser-bookmarks-bar {
    background: rgba(10, 12, 20, 0.85);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .browser-bookmark-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11.5px;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.12s ease;
    white-space: nowrap;
    max-width: 160px;
  }

  .browser-bookmark-chip:hover {
    color: var(--color-text-primary);
    background: rgba(255, 255, 255, 0.07);
    transform: translateY(-1px);
  }

  .browser-bookmark-chip:active {
    transform: scale(0.97);
  }

  .browser-bookmark-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .browser-webview-host {
    background: #0a0b10;
  }
</style>
