<script lang="ts">
  import type { FileNode } from "$lib/utils/tauri";
  import { readDirectoryChildren } from "$lib/utils/tauri";
  import { settings } from "$lib/stores/settings";
  import FileTreeNode from "./FileTreeNode.svelte";

  interface Props {
    node: FileNode;
    depth: number;
    onFileClick: (node: FileNode) => void;
    onContextMenu?: (node: FileNode, x: number, y: number) => void;
    filterText?: string;
  }

  let { node, depth, onFileClick, onContextMenu, filterText = "" }: Props = $props();
  let expanded = $state(false);
  let children = $state<FileNode[]>(node.children || []);
  let loaded = $state(false);

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

  const paddingLeft = $derived(`${depth * 20 + 12}px`);

  function getFileColor(ext?: string): string {
    if (!ext) return "var(--color-text-muted)";
    const map: Record<string, string> = {
      md: "#89b4fa", markdown: "#89b4fa",
      ts: "#3178c6", tsx: "#3178c6",
      js: "#f7df1e", jsx: "#f7df1e", mjs: "#f7df1e",
      py: "#3776ab",
      rs: "#dea584",
      html: "#e34c26", htm: "#e34c26",
      css: "#264de4", scss: "#cd6799",
      json: "#a6e3a1", yaml: "#a6e3a1", yml: "#a6e3a1", toml: "#a6e3a1",
      sql: "#f38ba8",
      svelte: "#ff3e00",
      vue: "#42b883",
      png: "#a6e3a1", jpg: "#a6e3a1", jpeg: "#a6e3a1", gif: "#a6e3a1", svg: "#f9e2af", webp: "#a6e3a1",
      pdf: "#f38ba8",
      sh: "#a6e3a1", ps1: "#89b4fa", bat: "#89b4fa",
    };
    return map[ext.toLowerCase()] || "var(--color-text-muted)";
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="w-full flex items-center gap-2.5 text-left hover:bg-bg-hover transition-colors cursor-pointer group select-none"
  style="padding-top: 6px; padding-bottom: 6px; font-size: 13.5px;"
  style:padding-left={paddingLeft}
  onclick={toggle}
  oncontextmenu={handleContextMenu}
  role="treeitem"
>
  <!-- Expand arrow for dirs -->
  {#if node.is_dir}
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"
      class="shrink-0 text-text-muted transition-transform duration-150"
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
      <svg width="16" height="16" viewBox="0 0 24 24" class="shrink-0" style:color="var(--color-accent)">
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v1H2V6z" fill="currentColor" opacity="0.4"/>
        <path d="M2 9h20v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" fill="currentColor" opacity="0.7"/>
      </svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" class="shrink-0" style:color="var(--color-warning)">
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="currentColor" opacity="0.7"/>
      </svg>
    {/if}
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" class="shrink-0" style:color={getFileColor(node.ext)}>
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
</div>

{#if node.is_dir && expanded}
  {#each filteredChildren(children) as child (child.path)}
    <FileTreeNode
      node={child}
      depth={depth + 1}
      {onFileClick}
      {onContextMenu}
      {filterText}
    />
  {/each}
{/if}
