<script lang="ts">
  import { get } from "svelte/store";
  import { activeTab } from "$lib/stores/tabs";
  import { terminalVisible, terminalInstances, bottomTerminals, addTerminal } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { formatFileSize } from "$lib/utils/file-types";
  import { uiZoom } from "$lib/stores/ui";
  import { settings, settingsVisible } from "$lib/stores/settings";

  function toggleTerminal() {
    const bottomCount = get(bottomTerminals).length;
    if (bottomCount === 0) {
      // No terminals exist — spawn one
      addTerminal(get(workspacePath) || "", get(settings).defaultTerminalDock);
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
    <button
      onclick={() => settingsVisible.update((v) => !v)}
      class="flex items-center gap-1 hover:text-text-primary transition-colors"
      title="Settings (Ctrl+,)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      </svg>
    </button>
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
