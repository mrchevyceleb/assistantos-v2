<script lang="ts">
  import { tabs, activeTabId, closeTab } from "$lib/stores/tabs";

  function handleTabClick(id: string) {
    activeTabId.set(id);
  }

  function handleClose(e: MouseEvent, id: string) {
    e.stopPropagation();
    closeTab(id);
  }

  function handleMiddleClick(e: MouseEvent, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(id);
    }
  }

  function getExtColor(ext?: string): string {
    if (!ext) return "var(--color-text-muted)";
    const colors: Record<string, string> = {
      md: "#89b4fa",
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
  <div class="flex items-center bg-bg-tertiary border-b border-border overflow-x-auto min-h-[36px]">
    {#each $tabs as tab (tab.id)}
      <div
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border whitespace-nowrap
               transition-colors cursor-pointer group min-w-0 shrink-0"
        class:bg-bg-primary={$activeTabId === tab.id}
        class:text-text-primary={$activeTabId === tab.id}
        class:bg-bg-tertiary={$activeTabId !== tab.id}
        class:text-text-muted={$activeTabId !== tab.id}
        class:hover:bg-bg-hover={$activeTabId !== tab.id}
        onclick={() => handleTabClick(tab.id)}
        onmousedown={(e) => handleMiddleClick(e, tab.id)}
        role="tab"
        tabindex="0"
      >
        <!-- Modified indicator -->
        {#if tab.isModified}
          <span class="w-2 h-2 rounded-full bg-accent shrink-0"></span>
        {:else}
          <span class="w-2 h-2 rounded-full shrink-0" style:background={getExtColor(tab.ext)} style:opacity="0.6"></span>
        {/if}

        <span class="truncate max-w-[150px]">{tab.name}</span>

        <!-- Close button -->
        <span
          class="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-opacity cursor-pointer"
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
      </div>
    {/each}
  </div>
{/if}
