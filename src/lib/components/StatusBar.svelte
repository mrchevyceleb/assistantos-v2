<script lang="ts">
  import { onMount } from "svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { get } from "svelte/store";
  import { activeTab } from "$lib/stores/tabs";
  import { terminalVisible, bottomTerminals, addTerminal } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { formatFileSize } from "$lib/utils/file-types";
  import { uiZoom } from "$lib/stores/ui";
  import { settings, settingsVisible } from "$lib/stores/settings";
  import { chatPanelVisible } from "$lib/stores/chat";

  let appVersion = $state("...");

  onMount(async () => {
    try {
      appVersion = await getVersion();
    } catch {
      appVersion = "dev";
    }
  });

  function toggleTerminal() {
    const dock = get(settings).defaultTerminalDock;
    if (dock === "bottom") {
      const bottomCount = get(bottomTerminals).length;
      if (bottomCount === 0) {
        addTerminal(get(workspacePath) || "", "bottom");
      } else {
        terminalVisible.update((v) => !v);
      }
    } else {
      // For tab/right/left, always spawn a new terminal
      addTerminal(get(workspacePath) || "", dock);
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

<div class="flex items-center justify-between bg-bg-tertiary/90 backdrop-blur-sm border-t border-border/60 text-text-muted panel-lift metal-sheen" style="padding: 0 22px; height: 46px; font-size: calc(15.5px * var(--ui-zoom)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.56), 0 -4px 14px rgba(0,0,0,0.25);">
  <div class="flex items-center gap-5">
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
      <span>AssistantOS v{appVersion}</span>
    {/if}
  </div>

  <div class="flex items-center gap-5">
    <button
      onclick={() => settingsVisible.update((v) => !v)}
      class="status-btn flex items-center gap-1 hover:text-text-primary transition-colors"
      title="Settings (Ctrl+,)"
    >
      <svg width="20" height="20" style="width: calc(20px * var(--ui-zoom)); height: calc(20px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      </svg>
    </button>
    <span class="text-text-muted">{Math.round($uiZoom * 100)}%</span>
    <span>UTF-8</span>
    <button
      onclick={() => chatPanelVisible.update((v) => !v)}
      class="status-btn flex items-center gap-1.5 hover:text-text-primary transition-colors"
      title="AI Chat (Ctrl+L)"
    >
      <svg width="20" height="20" style="width: calc(20px * var(--ui-zoom)); height: calc(20px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
      </svg>
      AI Chat
    </button>
    <button
      onclick={toggleTerminal}
      class="status-btn flex items-center gap-1.5 hover:text-text-primary transition-colors"
      title="Toggle Terminal (Ctrl+`)"
    >
      <svg width="21" height="21" style="width: calc(21px * var(--ui-zoom)); height: calc(21px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

<style>
  .status-btn {
    padding: 6px 11px;
    border-radius: 7px;
  }

  .status-btn:hover {
    background: linear-gradient(180deg, rgba(62, 70, 88, 0.32) 0%, rgba(18, 22, 33, 0.45) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.48);
  }
</style>
