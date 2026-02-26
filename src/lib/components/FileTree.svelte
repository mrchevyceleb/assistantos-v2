<script lang="ts">
  import { workspacePath, fileTree, isLoadingTree, workspaceName } from "$lib/stores/workspace";
  import { openTab } from "$lib/stores/tabs";
  import { addTerminal } from "$lib/stores/terminal";
  import { readDirectoryTree, readDirectoryChildren, readFileText, createFile, renamePath, deletePath } from "$lib/utils/tauri";
  import { updateTabContent, setTabLoading } from "$lib/stores/tabs";
  import { getFileIcon } from "$lib/utils/file-types";
  import type { FileNode } from "$lib/utils/tauri";
  import FileTreeNode from "./FileTreeNode.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  let filterText = $state("");

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
      const tree = await readDirectoryTree(path);
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
        { label: "Copy Path", action: () => handleCopyPath(node) },
        { label: "Rename", action: () => handleRename(node) },
        { label: "", separator: true, action: () => {} },
        { label: "Delete", action: () => handleDelete(node), danger: true },
      ];
    } else {
      return [
        { label: "Open", action: () => handleOpen(node) },
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

<div class="flex flex-col h-full bg-bg-secondary">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border gap-2 min-w-0" style="padding: 10px 14px;">
    <span class="font-semibold text-text-secondary uppercase tracking-wide truncate min-w-0" style="font-size: 11.5px;" title={$workspaceName}>
      {$workspaceName}
    </span>
    <div class="flex items-center gap-1 shrink-0">
      {#if $workspacePath}
        <!-- New File button -->
        <button
          onclick={() => handleNewFile($workspacePath!)}
          class="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded hover:bg-bg-hover"
          title="New File"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <!-- New Folder button -->
        <button
          onclick={() => handleNewFolder($workspacePath!)}
          class="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded hover:bg-bg-hover"
          title="New Folder"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
      {/if}
      <!-- Open Folder button -->
      <button
        onclick={handleOpenFolder}
        class="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded hover:bg-bg-hover"
        title="Open Folder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Filter -->
  {#if $fileTree}
    <div style="padding: 8px 14px;">
      <input
        type="text"
        placeholder="Filter files..."
        bind:value={filterText}
        class="w-full bg-bg-primary text-text-primary rounded-md border border-border
               focus:border-accent focus:outline-none placeholder-text-muted"
        style="font-size: 13px; padding: 7px 12px;"
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
