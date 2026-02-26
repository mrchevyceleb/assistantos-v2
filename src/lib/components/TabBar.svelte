<script lang="ts">
  import { get } from "svelte/store";
  import { tabs, activeTabId, closeTab, moveTab } from "$lib/stores/tabs";
  import { addTerminal } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { settings } from "$lib/stores/settings";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

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

  function handleClose(e: MouseEvent, id: string) {
    e.stopPropagation();
    safeCloseTab(id);
  }

  function handleMiddleClick(e: MouseEvent, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      safeCloseTab(id);
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

  // ── Drag to reorder ───────────────────────────────────────────────
  function handleDragStart(e: DragEvent, tabId: string) {
    dragTabId = tabId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tabId);
    }
    // Make the dragged tab active
    activeTabId.set(tabId);
  }

  function handleDragOver(e: DragEvent, tabId: string) {
    e.preventDefault();
    if (!dragTabId || dragTabId === tabId) {
      dragOverTabId = null;
      dragSide = null;
      return;
    }
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    // Determine left/right side based on mouse position
    const target = (e.currentTarget as HTMLElement);
    const rect = target.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    dragOverTabId = tabId;
    dragSide = e.clientX < midX ? "left" : "right";
  }

  function handleDragLeave(e: DragEvent, tabId: string) {
    if (dragOverTabId === tabId) {
      dragOverTabId = null;
      dragSide = null;
    }
  }

  function handleDrop(e: DragEvent, tabId: string) {
    e.preventDefault();
    if (!dragTabId || dragTabId === tabId) {
      resetDrag();
      return;
    }
    const currentTabs = get(tabs);
    const fromIdx = currentTabs.findIndex((t) => t.id === dragTabId);
    const overIdx = currentTabs.findIndex((t) => t.id === tabId);
    if (fromIdx === -1 || overIdx === -1) {
      resetDrag();
      return;
    }

    // Compute the target position in the array AFTER removing the dragged item
    // 1. Remove dragged tab from its position
    // 2. Find where to insert relative to the drop target
    let insertIdx: number;
    if (dragSide === "right") {
      // Insert after the target
      insertIdx = overIdx + 1;
    } else {
      // Insert before the target
      insertIdx = overIdx;
    }
    // If dragging from before the insert point, account for the removal shift
    if (fromIdx < insertIdx) {
      insertIdx -= 1;
    }
    insertIdx = Math.max(0, Math.min(currentTabs.length - 1, insertIdx));
    moveTab(fromIdx, insertIdx);
    resetDrag();
  }

  function handleDragEnd() {
    resetDrag();
  }

  function resetDrag() {
    dragTabId = null;
    dragOverTabId = null;
    dragSide = null;
  }

  function safeCloseTab(tabId: string) {
    const currentSettings = get(settings);
    if (currentSettings.confirmCloseUnsaved) {
      const currentTabs = get(tabs);
      const tab = currentTabs.find((t) => t.id === tabId);
      if (tab?.isModified) {
        if (!window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
      }
    }
    closeTab(tabId);
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
      { label: "Close", action: () => safeCloseTab(tabId) },
      ...(hasOthers ? [{ label: "Close Others", action: () => closeOtherTabs(tabId) }] : []),
      ...(hasLeft ? [{ label: "Close to the Left", action: () => closeTabsToLeft(tabId) }] : []),
      ...(hasRight ? [{ label: "Close to the Right", action: () => closeTabsToRight(tabId) }] : []),
      { label: "", separator: true, action: () => {} },
      { label: "Copy Path", action: () => handleCopyTabPath(tabId) },
      { label: "Rename Tab", action: () => handleRenameTab(tabId) },
      { label: "", separator: true, action: () => {} },
      { label: "Close All", action: () => closeAllTabs(), danger: true },
      { label: "", separator: true, action: () => {} },
      { label: "New Terminal", action: () => addTerminal(get(workspacePath) || "", get(settings).defaultTerminalDock) },
    ];
  }

  function getBarContextMenuItems(): MenuItem[] {
    return [
      { label: "New Terminal", action: () => addTerminal(get(workspacePath) || "", get(settings).defaultTerminalDock) },
      ...(get(tabs).length > 0 ? [
        { label: "", separator: true, action: () => {} },
        { label: "Close All Tabs", action: () => closeAllTabs(), danger: true },
      ] : []),
    ];
  }

  function getExtColor(ext?: string): string {
    if (!ext) return "var(--color-text-muted)";
    const colors: Record<string, string> = {
      md: "#58b4d0",
      ts: "#3178c6",
      tsx: "#3178c6",
      js: "#f7df1e",
      jsx: "#f7df1e",
      py: "#3776ab",
      rs: "#dea584",
      html: "#e34c26",
      css: "#264de4",
      json: "#a6e3a1",
      sql: "#f38ba8",
      svelte: "#ff3e00",
    };
    return colors[ext.toLowerCase()] || "var(--color-text-muted)";
  }
</script>

{#if $tabs.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex items-center bg-bg-tertiary border-b border-border overflow-x-auto metal-sheen"
    style="min-height: 44px;"
    oncontextmenu={handleBarContextMenu}
  >
    {#each $tabs as tab, i (tab.id)}
      <div
        class="flex items-center gap-2.5 border-r border-border whitespace-nowrap
               transition-colors cursor-grab group min-w-0 shrink-0 relative"
        style="padding: 12px 20px; font-size: 13px;"
        class:bg-bg-primary={$activeTabId === tab.id}
        class:text-text-primary={$activeTabId === tab.id}
        class:bg-bg-tertiary={$activeTabId !== tab.id}
        class:text-text-muted={$activeTabId !== tab.id}
        class:hover:bg-bg-hover={$activeTabId !== tab.id}
        class:opacity-50={dragTabId === tab.id}
        data-tab-id={tab.id}
        onclick={() => handleTabClick(tab.id)}
        onmousedown={(e) => handleMiddleClick(e, tab.id)}
        oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
        draggable="true"
        ondragstart={(e) => handleDragStart(e, tab.id)}
        ondragover={(e) => handleDragOver(e, tab.id)}
        ondragleave={(e) => handleDragLeave(e, tab.id)}
        ondrop={(e) => handleDrop(e, tab.id)}
        ondragend={handleDragEnd}
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
        <span
          class="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-opacity cursor-pointer"
          onclick={(e) => handleClose(e, tab.id)}
          title="Close"
          role="button"
          tabindex="0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>

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
    class="bg-bg-tertiary border-b border-border metal-sheen"
    style="min-height: 44px;"
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
