<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { workspacePath, fileTree, isLoadingTree, workspaceName, collapseAll } from "$lib/stores/workspace";
  import { openTab } from "$lib/stores/tabs";
  import { addTerminal } from "$lib/stores/terminal";
  import { settings } from "$lib/stores/settings";
  import { readDirectoryTree, readFileText, createFile, renamePath, deletePath, importPaths } from "$lib/utils/tauri";
  import { updateTabContent, setTabLoading } from "$lib/stores/tabs";
  import type { FileNode } from "$lib/utils/tauri";
  import FileTreeNode from "./FileTreeNode.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  let filterText = $state("");
  let treeRootEl: HTMLDivElement | null = null;
  let externalDragActive = $state(false);

  // Pointer-based drag state for internal tree node reordering
  let dragState = $state<{
    active: boolean;
    sourcePath: string;
    sourceName: string;
    sourceIsDir: boolean;
    startX: number;
    startY: number;
    pointerId: number;
    captured: boolean;
  } | null>(null);
  let dragOverPath = $state<string | null>(null);

  const DRAG_DEAD_ZONE = 5;

  function handleTreeDragStart(node: FileNode, e: PointerEvent) {
    // Record intent but don't start drag yet (dead zone)
    dragState = {
      active: false,
      sourcePath: node.path,
      sourceName: node.name,
      sourceIsDir: node.is_dir,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      captured: false,
    };
  }

  // Ghost element position for drag indicator
  let ghostPos = $state<{ x: number; y: number } | null>(null);

  function handleTreePointerMove(e: PointerEvent) {
    if (!dragState) return;

    if (!dragState.active) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) < DRAG_DEAD_ZONE && Math.abs(dy) < DRAG_DEAD_ZONE) return;
      // Past dead zone: activate drag
      dragState.active = true;
      if (!dragState.captured && treeRootEl) {
        treeRootEl.setPointerCapture(dragState.pointerId);
        dragState.captured = true;
      }
    }

    // Update ghost position
    ghostPos = { x: e.clientX, y: e.clientY };

    // Find target node under pointer
    // Release capture momentarily so elementFromPoint works
    if (dragState.captured && treeRootEl) {
      treeRootEl.releasePointerCapture(dragState.pointerId);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (dragState.captured && treeRootEl) {
      treeRootEl.setPointerCapture(dragState.pointerId);
    }

    const row = el?.closest("[data-tree-node-path]") as HTMLElement | null;
    if (row) {
      const targetPath = row.dataset.treeNodePath || null;
      if (targetPath && targetPath !== dragState.sourcePath) {
        dragOverPath = targetPath;
      } else {
        dragOverPath = null;
      }
    } else {
      dragOverPath = null;
    }
  }

  function handleTreePointerUp(e: PointerEvent) {
    if (!dragState) return;

    if (dragState.captured && treeRootEl) {
      treeRootEl.releasePointerCapture(dragState.pointerId);
    }

    if (dragState.active && dragOverPath) {
      // Determine destination directory
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const row = el?.closest("[data-tree-node-path]") as HTMLElement | null;
      let destDir: string | null = null;
      if (row) {
        const targetPath = row.dataset.treeNodePath;
        const isDir = row.dataset.treeNodeDir === "true";
        if (targetPath) {
          destDir = isDir ? targetPath : getParentPath(targetPath);
        }
      }
      if (destDir) {
        handleMoveNode(
          { path: dragState.sourcePath, name: dragState.sourceName, isDir: dragState.sourceIsDir },
          destDir,
        );
      }
    }

    dragState = null;
    dragOverPath = null;
    ghostPos = null;
  }

  // Context menu state
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    node: FileNode | null;
  }>({ visible: false, x: 0, y: 0, node: null });

  async function loadTree(path: string) {
    isLoadingTree.set(true);
    try {
      const tree = await readDirectoryTree(path, $settings.showHiddenFiles);
      fileTree.set(tree);
      workspaceName.set(tree.name);
    } catch (e) {
      console.error("Failed to load directory:", e);
    } finally {
      isLoadingTree.set(false);
    }
  }

  async function refreshTree() {
    const path = $workspacePath;
    if (path) {
      await loadTree(path);
    }
  }

  function handleCollapseAll() {
    filterText = "";
    collapseAll();
  }

  function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function isSubPath(parentPath: string, childPath: string): boolean {
    const parent = normalizePath(parentPath);
    const child = normalizePath(childPath);
    return child === parent || child.startsWith(`${parent}/`);
  }

  function isPointInsideTree(x: number, y: number): boolean {
    if (!treeRootEl) return false;
    const rect = treeRootEl.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function targetDirectoryFromPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const row = el?.closest("[data-tree-node-path]") as HTMLElement | null;
    if (!row) return $workspacePath;

    const nodePath = row.dataset.treeNodePath;
    if (!nodePath) return $workspacePath;
    const isDir = row.dataset.treeNodeDir === "true";
    return isDir ? nodePath : getParentPath(nodePath);
  }

  async function handleMoveNode(source: { path: string; name: string; isDir: boolean }, destinationDir: string) {
    if (!destinationDir) return;

    if (source.isDir && isSubPath(source.path, destinationDir)) {
      window.alert("You cannot move a folder into itself.");
      return;
    }

    const sourceParent = getParentPath(source.path);
    if (normalizePath(sourceParent) === normalizePath(destinationDir)) {
      return;
    }

    try {
      await importPaths([source.path], destinationDir, true);
      await refreshTree();
    } catch (e) {
      console.error("Failed to move path:", e);
      window.alert(`Failed to move "${source.name}".`);
    }
  }

  onMount(() => {
    let unlistenDragDrop: (() => void) | null = null;

    (async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        unlistenDragDrop = await appWindow.onDragDropEvent(async (event: any) => {
          const payload = event?.payload;
          const type = payload?.type;

          if (type === "leave") {
            externalDragActive = false;
            return;
          }

          const position = payload?.position;
          if (!position || !$workspacePath) return;

          const insideTree = isPointInsideTree(position.x, position.y);

          if (type === "enter" || type === "over") {
            externalDragActive = insideTree;
            return;
          }

          if (type !== "drop") return;

          externalDragActive = false;
          if (!insideTree) return;

          const droppedPaths = Array.isArray(payload?.paths) ? (payload.paths as string[]) : [];
          if (droppedPaths.length === 0) return;

          const destinationDir = targetDirectoryFromPoint(position.x, position.y) || $workspacePath;
          if (!destinationDir) return;

          const moveItems = window.confirm("Move dropped items here?\nPress Cancel to copy instead.");
          try {
            await importPaths(droppedPaths, destinationDir, moveItems);
            await refreshTree();
          } catch (e) {
            console.error("Failed to import dropped paths:", e);
            window.alert("Failed to import dropped files/folders.");
          }
        });
      } catch (e) {
        console.error("Failed to initialize drag-and-drop listener:", e);
      }
    })();

    return () => {
      if (unlistenDragDrop) {
        unlistenDragDrop();
      }
    };
  });

  async function handleOpenFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Folder",
      });
      if (selected && typeof selected === "string") {
        workspacePath.set(selected);
        await loadTree(selected);
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  }

  async function handleFileClick(node: FileNode) {
    if (node.is_dir) return;
    const tabId = openTab(node.path, node.name, node.ext);
    try {
      const content = await readFileText(node.path);
      updateTabContent(tabId, content);
    } catch (e) {
      console.error("Failed to read file:", e);
      setTabLoading(tabId, false);
    }
  }

  function handleContextMenu(node: FileNode, x: number, y: number) {
    contextMenu = { visible: true, x, y, node };
  }

  function closeContextMenu() {
    contextMenu = { visible: false, x: 0, y: 0, node: null };
  }

  function getParentPath(filePath: string): string {
    const sep = filePath.includes("\\") ? "\\" : "/";
    const parts = filePath.split(sep);
    parts.pop();
    return parts.join(sep);
  }

  function joinPath(...parts: string[]): string {
    const sep = parts[0]?.includes("\\") ? "\\" : "/";
    return parts.join(sep);
  }

  // --- File operations ---

  async function handleOpen(node: FileNode) {
    handleFileClick(node);
  }

  function handleOpenTerminalHere(node: FileNode) {
    const cwd = node.is_dir ? node.path : getParentPath(node.path);
    addTerminal(cwd, get(settings).defaultTerminalDock);
  }

  async function handleNewFile(parentPath: string) {
    const name = window.prompt("New file name:");
    if (!name) return;
    try {
      const fullPath = joinPath(parentPath, name);
      await createFile(fullPath, false);
      await refreshTree();
    } catch (e) {
      console.error("Failed to create file:", e);
    }
  }

  async function handleNewFolder(parentPath: string) {
    const name = window.prompt("New folder name:");
    if (!name) return;
    try {
      const fullPath = joinPath(parentPath, name);
      await createFile(fullPath, true);
      await refreshTree();
    } catch (e) {
      console.error("Failed to create folder:", e);
    }
  }

  async function handleRename(node: FileNode) {
    const newName = window.prompt("Rename to:", node.name);
    if (!newName || newName === node.name) return;
    try {
      const parent = getParentPath(node.path);
      const newPath = joinPath(parent, newName);
      await renamePath(node.path, newPath);
      await refreshTree();
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  }

  async function handleDelete(node: FileNode) {
    const confirmed = window.confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deletePath(node.path);
      await refreshTree();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  }

  // --- Build context menu items ---

  async function handleCopyPath(node: FileNode) {
    try {
      await navigator.clipboard.writeText(node.path);
    } catch {
      // Fallback for older webview
      const ta = document.createElement("textarea");
      ta.value = node.path;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  function getContextMenuItems(node: FileNode): MenuItem[] {
    if (node.is_dir) {
      return [
        { label: "New File", action: () => handleNewFile(node.path) },
        { label: "New Folder", action: () => handleNewFolder(node.path) },
        { label: "", separator: true, action: () => {} },
        { label: "Open Terminal Here", action: () => handleOpenTerminalHere(node), shortcut: "Ctrl+`" },
        { label: "", separator: true, action: () => {} },
        { label: "Copy Path", action: () => handleCopyPath(node) },
        { label: "Rename", action: () => handleRename(node) },
        { label: "", separator: true, action: () => {} },
        { label: "Delete", action: () => handleDelete(node), danger: true },
      ];
    } else {
      return [
        { label: "Open", action: () => handleOpen(node) },
        { label: "Open Terminal Here", action: () => handleOpenTerminalHere(node), shortcut: "Ctrl+`" },
        { label: "", separator: true, action: () => {} },
        { label: "Copy Path", action: () => handleCopyPath(node) },
        { label: "Rename", action: () => handleRename(node) },
        { label: "", separator: true, action: () => {} },
        { label: "Delete", action: () => handleDelete(node), danger: true },
      ];
    }
  }

  function filteredChildren(children: FileNode[] | undefined): FileNode[] {
    if (!children) return [];
    if (!filterText) return children;
    const lower = filterText.toLowerCase();
    return children.filter((c) => {
      if (c.name.toLowerCase().includes(lower)) return true;
      if (c.is_dir && c.children) {
        return filteredChildren(c.children).length > 0;
      }
      return false;
    });
  }

  // Auto-load if workspacePath is already set
  $effect(() => {
    const path = $workspacePath;
    if (path && !$fileTree) {
      loadTree(path);
    }
  });
</script>

<div
  class="relative flex flex-col h-full metal-inset panel-lift rounded-xl overflow-hidden"
  bind:this={treeRootEl}
  onpointermove={handleTreePointerMove}
  onpointerup={handleTreePointerUp}
>
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border gap-2 min-w-0 metal-sheen" style="padding: 14px 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -1px 0 rgba(0,0,0,0.45);">
    <span class="font-semibold text-text-secondary uppercase tracking-wide truncate min-w-0" style="font-size: {$settings.fileTreeFontSize}px;" title={$workspaceName}>
      {$workspaceName}
    </span>
    <div class="flex items-center gap-1 shrink-0">
      {#if $workspacePath}
        <!-- New File button -->
        <button
          onclick={() => handleNewFile($workspacePath!)}
          class="text-text-muted hover:text-text-primary transition-colors p-2 rounded-md hover:bg-bg-hover"
          title="New File"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <!-- New Folder button -->
        <button
          onclick={() => handleNewFolder($workspacePath!)}
          class="text-text-muted hover:text-text-primary transition-colors p-2 rounded-md hover:bg-bg-hover"
          title="New Folder"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <!-- Collapse All button -->
        <button
          onclick={handleCollapseAll}
          class="text-text-muted hover:text-text-primary transition-colors p-2 rounded-md hover:bg-bg-hover"
          title="Collapse All"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
            <polyline points="6 4 12 10 18 4"/>
          </svg>
        </button>
      {/if}
      <!-- Open Folder button -->
      <button
        onclick={handleOpenFolder}
        class="text-text-muted hover:text-text-primary transition-colors p-2 rounded-md hover:bg-bg-hover"
        title="Open Folder"
      >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
      </button>
    </div>
  </div>

  <!-- Filter -->
  {#if $fileTree}
    <div style="padding: 10px 16px;">
      <input
        type="text"
        placeholder="Filter files..."
        bind:value={filterText}
        class="w-full bg-bg-primary/90 text-text-primary rounded-md border border-border
               focus:border-accent focus:outline-none focus:shadow-[0_0_8px_rgba(88,180,208,0.15)] placeholder-text-muted"
        style="font-size: {$settings.fileTreeFontSize}px; padding: 10px 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);"
      />
    </div>
  {/if}

  <!-- Tree -->
  <div class="flex-1 overflow-y-auto overflow-x-hidden py-1">
    {#if $isLoadingTree}
      <div class="flex items-center justify-center h-32 text-text-muted text-sm">
        Loading...
      </div>
    {:else if $fileTree && $fileTree.children}
      {#each filteredChildren($fileTree.children) as node (node.path)}
        <FileTreeNode
          {node}
          depth={0}
          onFileClick={handleFileClick}
          onContextMenu={handleContextMenu}
          onMoveNode={handleMoveNode}
          onDragStart={handleTreeDragStart}
          {dragOverPath}
          {filterText}
        />
      {/each}
    {:else}
      <div class="flex flex-col items-center justify-center h-full text-text-muted gap-4 px-4">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <button
          onclick={handleOpenFolder}
          class="text-accent hover:text-accent-hover text-sm transition-colors"
        >
          Open a Folder
        </button>
        <span class="text-xs text-text-muted text-center">
          or press Ctrl+O
        </span>
      </div>
    {/if}
  </div>

  {#if externalDragActive}
    <div class="pointer-events-none absolute inset-0 z-30 bg-accent/10 border-2 border-dashed border-accent/70 rounded-xl flex items-center justify-center text-text-primary text-sm">
      Drop files or folders to import
    </div>
  {/if}

  <!-- Drag ghost indicator -->
  {#if dragState?.active && ghostPos}
    <div
      class="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md bg-bg-secondary/95 border border-accent/50 text-text-primary shadow-lg backdrop-blur-sm"
      style="left: {ghostPos.x + 14}px; top: {ghostPos.y - 12}px; padding: 5px 10px; font-size: {$settings.fileTreeFontSize}px; max-width: 220px;"
    >
      {#if dragState.sourceIsDir}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="shrink-0 text-accent/70"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" opacity="0.7"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="shrink-0 text-accent/70"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" opacity="0.5"/><polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      {/if}
      <span class="truncate">{dragState.sourceName}</span>
    </div>
  {/if}
</div>

<!-- Context Menu -->
{#if contextMenu.visible && contextMenu.node}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.node)}
    onClose={closeContextMenu}
  />
{/if}
