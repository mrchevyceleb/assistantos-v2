<script lang="ts">
  import { get } from "svelte/store";
  import { activeTab } from "$lib/stores/tabs";
  import { terminalVisible, terminalInstances, bottomTerminals, addTerminal } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { formatFileSize } from "$lib/utils/file-types";
  import { uiZoom } from "$lib/stores/ui";

  function toggleTerminal() {
    const bottomCount = get(bottomTerminals).length;
    if (bottomCount === 0) {
      // No terminals exist — spawn one
      addTerminal(get(workspacePath) || "", "bottom");
    } else {
      // Toggle panel visibility
      terminalVisible.update((v) => !v);
    }
  }

  function getRelativePath(fullPath: string): string {
    const wp = $workspacePath;
    if (wp && fullPath.startsWith(wp)) {
      return fullPath.slice(wp.length).replace(/^[/\\]/, "");
    }
    return fullPath;
  }
</script>

<div class="flex items-center justify-between bg-bg-tertiary border-t border-border text-text-muted" style="padding: 0 16px; height: 32px; font-size: 12.5px;">
  <div class="flex items-center gap-4">
    {#if $activeTab}
      <span class="truncate max-w-[400px]" title={$activeTab.path}>
        {getRelativePath($activeTab.path)}
      </span>
      {#if $activeTab.ext}
        <span class="uppercase">{$activeTab.ext}</span>
      {/if}
      {#if $activeTab.isModified}
        <span class="text-accent">Modified</span>
      {/if}
    {:else}
      <span>AssistantOS v0.1.0</span>
    {/if}
  </div>

  <div class="flex items-center gap-4">
    <span class="text-text-muted">{Math.round($uiZoom * 100)}%</span>
    <span>UTF-8</span>
    <button
      onclick={toggleTerminal}
      class="flex items-center gap-1.5 hover:text-text-primary transition-colors"
      title="Toggle Terminal (Ctrl+`)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
      Terminal
      {#if $terminalVisible}
        <span>&#9660;</span>
      {:else}
        <span>&#9650;</span>
      {/if}
    </button>
  </div>
</div>
