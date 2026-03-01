<script lang="ts">
  import type { FileNode } from "$lib/utils/tauri";
  import { readDirectoryChildren } from "$lib/utils/tauri";
  import { settings } from "$lib/stores/settings";
  import { getFileColor } from "$lib/utils/file-types";
  import FileTreeNode from "./FileTreeNode.svelte";

  interface Props {
    node: FileNode;
    depth: number;
    onFileClick: (node: FileNode) => void;
    onContextMenu?: (node: FileNode, x: number, y: number) => void;
    filterText?: string;
    collapseVersion?: number;
  }

  let { node, depth, onFileClick, onContextMenu, filterText = "", collapseVersion = 0 }: Props = $props();
  let expanded = $state(false);
  let children = $state<FileNode[]>([]);
  let loaded = $state(false);

  $effect(() => {
    children = node.children || [];
  });

  async function toggle() {
    if (!node.is_dir) {
      onFileClick(node);
      return;
    }
    expanded = !expanded;
    if (expanded && !loaded) {
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
      expanded = true;
      if (!loaded) {
        readDirectoryChildren(node.path, $settings.showHiddenFiles).then((c) => {
          children = c;
          loaded = true;
        });
      }
    }
  });

  $effect(() => {
    collapseVersion;
    expanded = false;
  });

  const paddingLeft = $derived(`${depth * 27 + 16}px`);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="tree-row w-full flex items-center gap-3.5 text-left hover:bg-bg-hover transition-colors cursor-pointer group select-none rounded-lg"
  style="padding-top: 11px; padding-bottom: 11px; font-size: calc(18px * var(--ui-zoom));"
  style:padding-left={paddingLeft}
  style:border-left={depth > 0 ? "1px solid rgba(148,163,184,0.16)" : "none"}
  onclick={toggle}
  oncontextmenu={handleContextMenu}
  role="treeitem"
  aria-selected="false"
  aria-expanded={node.is_dir ? expanded : undefined}
  tabindex="-1"
>
  <!-- Expand arrow for dirs -->
  {#if node.is_dir}
      <svg
        width="15" height="15" style="width: calc(15px * var(--ui-zoom)); height: calc(15px * var(--ui-zoom));" viewBox="0 0 24 24" fill="currentColor" stroke="none"
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
      <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, true, node.ext)}>
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H2V6z" fill="currentColor" opacity="0.4"/>
        <path d="M2 9h20v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" fill="currentColor" opacity="0.7"/>
      </svg>
    {:else}
      <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, true, node.ext)}>
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="currentColor" opacity="0.7"/>
      </svg>
    {/if}
  {:else}
    <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.name, false, node.ext)}>
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
    <span class="px-2 py-0.5 rounded-md bg-bg-secondary/70 border border-border/50 text-text-muted uppercase tracking-wide ml-auto mr-2" style="font-size: calc(12.5px * var(--ui-zoom));">
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
      {filterText}
      {collapseVersion}
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
</style>
