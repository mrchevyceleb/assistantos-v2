<script lang="ts">
  import { get } from "svelte/store";
  import { tabs, activeTabId, closeTab, moveTab, reopenLastClosedTab, closedTabs, updateTabContent, setTabLoading } from "$lib/stores/tabs";
  import { addTerminal } from "$lib/stores/terminal";
  import { addChat } from "$lib/stores/chat-instances";
  import { workspacePath } from "$lib/stores/workspace";
  import { settings } from "$lib/stores/settings";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";
  import { getFileColor } from "$lib/utils/file-types";
  import { readFileText } from "$lib/utils/tauri";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { removeChat } from "$lib/stores/chat-instances";
  import { destroyInstanceState } from "$lib/stores/chat-instance-state";
  import { launchClaudeCode, removeClaudeCodeSession } from "$lib/stores/claude-code";

  // Context menu state
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    tabId: string | null;
  }>({ visible: false, x: 0, y: 0, tabId: null });

  // Drag state
  let dragTabId = $state<string | null>(null);
  let dragOverTabId = $state<string | null>(null);
  let dragSide = $state<"left" | "right" | null>(null);

  function handleTabClick(id: string) {
    activeTabId.set(id);
  }

  function handleTabKeydown(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTabClick(id);
    }
  }

  function handleClose(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    safeCloseTab(id);
  }

  function handleMiddleClick(e: MouseEvent, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      // Require Shift+middle-click to avoid accidental tab loss.
      if (e.shiftKey) {
        safeCloseTab(id);
      }
    }
  }

  function handleTabContextMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { visible: true, x: e.clientX, y: e.clientY, tabId: id };
  }

  function handleBarContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-tab-id]")) return;
    e.preventDefault();
    contextMenu = { visible: true, x: e.clientX, y: e.clientY, tabId: null };
  }

  function closeContextMenu() {
    contextMenu = { visible: false, x: 0, y: 0, tabId: null };
  }

  // ── Pointer-based drag to reorder ─────────────────────────────────
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pendingDragTabId: string | null = null;
  let isDragging = $state(false);
  let tabBarEl: HTMLDivElement | undefined = $state(undefined);

  const DEAD_ZONE = 5;

  function handlePointerDown(e: PointerEvent, tabId: string) {
    // Only primary button; ignore close button clicks
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pendingDragTabId = tabId;
    isDragging = false;
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pendingDragTabId) return;

    if (!isDragging) {
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      if (Math.sqrt(dx * dx + dy * dy) < DEAD_ZONE) return;

      // Start dragging
      isDragging = true;
      dragTabId = pendingDragTabId;
      activeTabId.set(dragTabId);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    if (!isDragging || !dragTabId) return;

    // Find which tab element the pointer is over
    const tabEls = tabBarEl?.querySelectorAll<HTMLElement>("[data-tab-id]");
    if (!tabEls) return;

    let foundId: string | null = null;
    let foundSide: "left" | "right" | null = null;

    for (const el of tabEls) {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const id = el.getAttribute("data-tab-id");
        if (id && id !== dragTabId) {
          foundId = id;
          foundSide = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
        }
        break;
      }
    }

    dragOverTabId = foundId;
    dragSide = foundSide;
  }

  function handlePointerUp(e: PointerEvent) {
    if (!pendingDragTabId) return;

    if (isDragging && dragTabId && dragOverTabId) {
      const currentTabs = get(tabs);
      const fromIdx = currentTabs.findIndex((t) => t.id === dragTabId);
      const overIdx = currentTabs.findIndex((t) => t.id === dragOverTabId);
      if (fromIdx !== -1 && overIdx !== -1) {
        let insertIdx: number;
        if (dragSide === "right") {
          insertIdx = overIdx + 1;
        } else {
          insertIdx = overIdx;
        }
        if (fromIdx < insertIdx) {
          insertIdx -= 1;
        }
        insertIdx = Math.max(0, Math.min(currentTabs.length - 1, insertIdx));
        moveTab(fromIdx, insertIdx);
      }
    }

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    resetDrag();
  }

  function resetDrag() {
    dragTabId = null;
    dragOverTabId = null;
    dragSide = null;
    pendingDragTabId = null;
    isDragging = false;
  }

  async function safeCloseTab(tabId: string) {
    const currentTabs = get(tabs);
    const tab = currentTabs.find((t) => t.id === tabId);
    if (!tab) return;

    const currentSettings = get(settings);

    if (tab.viewerType === "terminal") {
      const confirmed = await ask(`Close terminal tab "${tab.name}"? This will end the session.`, {
        title: "Close Terminal",
        kind: "warning",
      });
      if (!confirmed) return;
    }

    if (currentSettings.confirmCloseUnsaved && tab.isModified) {
      const confirmed = await ask(`"${tab.name}" has unsaved changes. Close anyway?`, {
        title: "Unsaved Changes",
        kind: "warning",
      });
      if (!confirmed) return;
    }

    // Keep chat instance store in sync when closing chat tabs via the tab bar.
    if (tab.path.startsWith("__chat__:")) {
      const chatId = tab.path.slice("__chat__:".length);
      if (chatId) {
        destroyInstanceState(chatId);
        removeChat(chatId);
      }
      return;
    }

    // Clean up Claude Code session when closing its tab.
    if (tab.path.startsWith("__claude-code__:")) {
      const ccId = tab.path.slice("__claude-code__:".length);
      if (ccId) {
        removeClaudeCodeSession(ccId);
      }
      return;
    }

    if (tab.viewerType === "terminal") {
      closeTab(tabId, { forceTerminal: true, skipConfirm: true });
    } else {
      closeTab(tabId, { skipConfirm: true });
    }
  }

  // ── Tab context menu actions ──────────────────────────────────────
  async function handleCopyTabPath(tabId: string) {
    const tab = get(tabs).find((t) => t.id === tabId);
    if (!tab) return;
    try {
      await navigator.clipboard.writeText(tab.path);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tab.path;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  function handleRenameTab(tabId: string) {
    const currentTabs = get(tabs);
    const tab = currentTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const newName = window.prompt("Rename tab:", tab.name);
    if (!newName || newName === tab.name) return;
    tabs.update((t) => t.map((tab) => (tab.id === tabId ? { ...tab, name: newName } : tab)));
  }

  function closeOtherTabs(tabId: string) {
    const currentTabs = get(tabs);
    for (const t of currentTabs) {
      if (t.id !== tabId) safeCloseTab(t.id);
    }
  }

  function closeTabsToRight(tabId: string) {
    const currentTabs = get(tabs);
    const idx = currentTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const toClose = currentTabs.slice(idx + 1);
    for (const t of toClose) safeCloseTab(t.id);
  }

  function closeTabsToLeft(tabId: string) {
    const currentTabs = get(tabs);
    const idx = currentTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const toClose = currentTabs.slice(0, idx);
    for (const t of toClose) safeCloseTab(t.id);
  }

  function closeAllTabs() {
    const currentTabs = get(tabs);
    for (const t of currentTabs) safeCloseTab(t.id);
  }

  function getTabContextMenuItems(tabId: string): MenuItem[] {
    const currentTabs = get(tabs);
    const idx = currentTabs.findIndex((t) => t.id === tabId);
    const hasLeft = idx > 0;
    const hasRight = idx < currentTabs.length - 1;
    const hasOthers = currentTabs.length > 1;

    return [
      { label: "Close", action: () => safeCloseTab(tabId), shortcut: "Ctrl+W" },
      ...(hasOthers ? [{ label: "Close Others", action: () => closeOtherTabs(tabId) }] : []),
      ...(hasLeft ? [{ label: "Close to the Left", action: () => closeTabsToLeft(tabId) }] : []),
      ...(hasRight ? [{ label: "Close to the Right", action: () => closeTabsToRight(tabId) }] : []),
      { label: "", separator: true, action: () => {} },
      { label: "Copy Path", action: () => handleCopyTabPath(tabId), shortcut: "Ctrl+C" },
      { label: "Rename Tab", action: () => handleRenameTab(tabId) },
      { label: "", separator: true, action: () => {} },
      { label: "Close All", action: () => closeAllTabs(), danger: true },
      { label: "", separator: true, action: () => {} },
      { label: "New Terminal", action: () => addTerminal(get(workspacePath) || "", get(settings).defaultTerminalDock) },
      { label: "New Chat", action: () => addChat(get(settings).aiModel, get(settings).aiProvider, 'tab') },
      { label: "Launch Claude Code", action: () => launchClaudeCode(get(workspacePath) || "") },
    ];
  }

  function getBarContextMenuItems(): MenuItem[] {
    return [
      {
        label: "Reopen Closed Tab",
        shortcut: "Ctrl+Shift+T",
        action: () => reopenClosedFromMenu(),
        disabled: $closedTabs.length === 0,
      },
      { label: "New Terminal", action: () => addTerminal(get(workspacePath) || "", get(settings).defaultTerminalDock) },
      { label: "New Chat", action: () => addChat(get(settings).aiModel, get(settings).aiProvider, 'tab') },
      { label: "Launch Claude Code", action: () => launchClaudeCode(get(workspacePath) || "") },
      ...(get(tabs).length > 0 ? [
        { label: "", separator: true, action: () => {} },
        { label: "Close All Tabs", action: () => closeAllTabs(), danger: true },
      ] : []),
    ];
  }

  function reopenClosedFromMenu() {
    const tabId = reopenLastClosedTab();
    if (!tabId) return;
    const reopened = get(tabs).find((t) => t.id === tabId);
    if (reopened && reopened.isLoading && !reopened.path.startsWith("__terminal__:")) {
      readFileText(reopened.path)
        .then((content) => updateTabContent(tabId, content))
        .catch(() => setTabLoading(tabId, false));
    }
  }

  function getExtColor(ext?: string): string {
    return getFileColor("tab", false, ext);
  }
</script>

{#if $tabs.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex items-center bg-bg-tertiary border-b border-border overflow-x-auto metal-sheen panel-lift"
    style="min-height: 54px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -2px 0 rgba(0,0,0,0.45), 0 8px 22px rgba(0,0,0,0.32);"
    oncontextmenu={handleBarContextMenu}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    bind:this={tabBarEl}
  >
    {#each $tabs as tab, i (tab.id)}
      <div
        class="flex items-center gap-3.5 border-r border-border whitespace-nowrap
               transition-all group min-w-0 shrink-0 relative"
        style="padding: 14px 22px; font-size: 13.5px; cursor: {isDragging ? 'grabbing' : 'grab'}; {dragTabId === tab.id ? 'opacity: 0.5;' : ''}"
        class:tab-active-metal={$activeTabId === tab.id}
        class:text-text-primary={$activeTabId === tab.id}
        class:tab-inactive-metal={$activeTabId !== tab.id}
        class:text-text-muted={$activeTabId !== tab.id}
        class:hover:bg-bg-hover={$activeTabId !== tab.id}
        data-tab-id={tab.id}
        onclick={() => handleTabClick(tab.id)}
        onkeydown={(e) => handleTabKeydown(e, tab.id)}
        onmousedown={(e) => handleMiddleClick(e, tab.id)}
        oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
        onpointerdown={(e) => handlePointerDown(e, tab.id)}
        role="tab"
        tabindex="0"
      >
        <!-- Drop indicator left -->
        {#if dragOverTabId === tab.id && dragSide === "left"}
          <div class="absolute left-0 top-1 bottom-1 w-[3px] bg-accent rounded-full"></div>
        {/if}

        <!-- Modified indicator -->
        {#if tab.isModified}
          <span class="w-2.5 h-2.5 rounded-full bg-accent shrink-0"></span>
        {:else}
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={getExtColor(tab.ext)} style:opacity="0.6"></span>
        {/if}

        <span class="truncate max-w-[180px]">{tab.name}</span>

        <!-- Close button -->
        <button
          type="button"
          class="ml-1 p-2 rounded-md opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-opacity cursor-pointer"
          onclick={(e) => handleClose(e, tab.id)}
          onpointerdown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onmousedown={(e) => e.stopPropagation()}
          title={`Close ${tab.name}`}
          aria-label={`Close ${tab.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- Drop indicator right -->
        {#if dragOverTabId === tab.id && dragSide === "right"}
          <div class="absolute right-0 top-1 bottom-1 w-[3px] bg-accent rounded-full"></div>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <!-- Empty tab bar — still right-clickable for new terminal -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bg-bg-tertiary border-b border-border metal-sheen panel-lift"
    style="min-height: 54px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -2px 0 rgba(0,0,0,0.45), 0 8px 22px rgba(0,0,0,0.32);"
    oncontextmenu={handleBarContextMenu}
  ></div>
{/if}

<!-- Tab context menu -->
{#if contextMenu.visible}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenu.tabId ? getTabContextMenuItems(contextMenu.tabId) : getBarContextMenuItems()}
    onClose={closeContextMenu}
  />
{/if}

<style>
  .tab-active-metal {
    background:
      linear-gradient(180deg, rgba(56, 63, 79, 0.92) 0%, rgba(26, 31, 44, 0.97) 38%, rgba(14, 17, 27, 0.98) 100%),
      linear-gradient(130deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.03) 42%, transparent 70%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.66),
      inset 1px 0 0 rgba(255, 255, 255, 0.06),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      0 10px 24px rgba(0, 0, 0, 0.38);
    border-bottom: 3px solid rgba(88, 180, 208, 0.92);
  }

  .tab-inactive-metal {
    background: linear-gradient(180deg, rgba(14, 17, 26, 0.93) 0%, rgba(8, 10, 16, 0.95) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      inset 0 -1px 0 rgba(0, 0, 0, 0.48);
  }
</style>
