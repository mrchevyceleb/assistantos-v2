<script lang="ts">
  import type { FileNode } from "$lib/utils/tauri";
  import { readDirectoryChildren } from "$lib/utils/tauri";
  import { settings } from "$lib/stores/settings";
  import { getFileColor } from "$lib/utils/file-types";
  import { expandedPaths, toggleExpanded, setExpanded } from "$lib/stores/workspace";

  const ftSize = $derived($settings.fileTreeFontSize);
  const iconSize = $derived(Math.round(ftSize * 1.3));
  const arrowSize = $derived(Math.round(ftSize * 0.85));
  const badgeSize = $derived(Math.round(ftSize * 0.72));
  import FileTreeNode from "./FileTreeNode.svelte";

  interface Props {
    node: FileNode;
    depth: number;
    onFileClick: (node: FileNode) => void;
    onContextMenu?: (node: FileNode, x: number, y: number) => void;
    onMoveNode?: (source: { path: string; name: string; isDir: boolean }, destinationDir: string) => void;
    onDragStart?: (node: FileNode, e: PointerEvent) => void;
    dragOverPath?: string | null;
    filterText?: string;
  }

  let {
    node,
    depth,
    onFileClick,
    onContextMenu,
    onMoveNode,
    onDragStart,
    dragOverPath = null,
    filterText = "",
  }: Props = $props();
  const expanded = $derived($expandedPaths.has(node.path));
  let children = $state<FileNode[]>([]);
  let loaded = $state(false);

  let isDropTarget = $derived(dragOverPath === node.path);

  $effect(() => {
    children = node.children || [];
  });

  async function toggle() {
    if (!node.is_dir) {
      onFileClick(node);
      return;
    }
    toggleExpanded(node.path);
    if (!expanded && !loaded) {
      try {
        children = await readDirectoryChildren(node.path, $settings.showHiddenFiles);
        loaded = true;
      } catch (e) {
        console.error("Failed to load children:", e);
      }
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(node, e.clientX, e.clientY);
  }

  function handlePointerDown(e: PointerEvent) {
    // Only handle primary button, skip if modifier keys (context menu etc)
    if (e.button !== 0) return;
    onDragStart?.(node, e);
  }

  function filteredChildren(items: FileNode[]): FileNode[] {
    if (!filterText) return items;
    const lower = filterText.toLowerCase();
    return items.filter((c) => {
      if (c.name.toLowerCase().includes(lower)) return true;
      if (c.is_dir) return true;
      return false;
    });
  }

  $effect(() => {
    if (filterText && node.is_dir && !expanded) {
      setExpanded(node.path, true);
      if (!loaded) {
        readDirectoryChildren(node.path, $settings.showHiddenFiles).then((c) => {
          children = c;
          loaded = true;
        });
      }
    }
  });

  const paddingLeft = $derived(`${depth * 27 + 16}px`);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="tree-row w-full flex items-center gap-3.5 text-left hover:bg-bg-hover transition-colors cursor-pointer group select-none rounded-lg"
  style="padding-top: 8px; padding-bottom: 8px; font-size: {ftSize}px;"
  style:padding-left={paddingLeft}
  style:border-left={depth > 0 ? "1px solid rgba(148,163,184,0.16)" : "none"}
  class:drop-target={isDropTarget}
  onclick={toggle}
  oncontextmenu={handleContextMenu}
  onpointerdown={handlePointerDown}
  data-tree-node-path={node.path}
  data-tree-node-dir={node.is_dir ? "true" : "false"}
  role="treeitem"
  aria-selected="false"
  aria-expanded={node.is_dir ? expanded : undefined}
  tabindex="-1"
>
  <!-- Expand arrow for dirs -->
  {#if node.is_dir}
      <svg
        width={arrowSize} height={arrowSize} style="width: {arrowSize}px; height: {arrowSize}px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"
        class="shrink-0 text-text-muted/80 transition-transform duration-150"
        class:rotate-90={expanded}
      >
      <path d="M8 5l8 7-8 7z"/>
    </svg>
  {:else}
    <span class="w-[12px] shrink-0"></span>
  {/if}

  <!-- Icon -->
  {#if node.is_dir}
    {#if expanded}
      <svg width={iconSize} height={iconSize} style="width: {iconSize}px; height: {iconSize}px;" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, true, node.ext)}>
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H2V6z" fill="currentColor" opacity="0.4"/>
        <path d="M2 9h20v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" fill="currentColor" opacity="0.7"/>
      </svg>
    {:else}
      <svg width={iconSize} height={iconSize} style="width: {iconSize}px; height: {iconSize}px;" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, true, node.ext)}>
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="currentColor" opacity="0.7"/>
      </svg>
    {/if}
  {:else}
    <svg width={iconSize} height={iconSize} style="width: {iconSize}px; height: {iconSize}px;" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, false, node.ext)}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>
      <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </svg>
  {/if}

  <!-- Name -->
  <span
    class="truncate"
    class:text-text-primary={node.is_dir}
    class:font-medium={node.is_dir}
    class:text-text-secondary={!node.is_dir}
  >
    {node.name}
  </span>

  {#if !node.is_dir && node.ext}
    <span class="px-2 py-0.5 rounded-md bg-bg-secondary/70 border border-border/50 text-text-muted uppercase tracking-wide ml-auto mr-2" style="font-size: {badgeSize}px;">
      {node.ext}
    </span>
  {/if}
</div>

{#if node.is_dir && expanded}
  {#each filteredChildren(children) as child (child.path)}
    <FileTreeNode
      node={child}
      depth={depth + 1}
      {onFileClick}
      {onContextMenu}
      {onMoveNode}
      {onDragStart}
      {dragOverPath}
      {filterText}
    />
  {/each}
{/if}

<style>
  .tree-row {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .tree-row:hover {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.09),
      inset 0 -1px 0 rgba(0, 0, 0, 0.35),
      0 4px 12px rgba(0, 0, 0, 0.18);
  }

  .drop-target {
    box-shadow:
      inset 0 0 0 2px rgba(88, 180, 208, 0.72),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    background: rgba(88, 180, 208, 0.12);
  }
</style>
