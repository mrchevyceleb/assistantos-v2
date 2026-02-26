<script lang="ts">
  export interface MenuItem {
    label: string;
    icon?: string;
    action: () => void;
    danger?: boolean;
    separator?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let adjustedX = $state(x);
  let adjustedY = $state(y);
  let visible = $state(false);

  $effect(() => {
    // Adjust position to avoid viewport overflow
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      adjustedX = x + rect.width > vw ? vw - rect.width - 8 : x;
      adjustedY = y + rect.height > vh ? vh - rect.height - 8 : y;
    }
    // Trigger fade-in on next tick
    requestAnimationFrame(() => {
      visible = true;
    });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  function handleBackdropClick() {
    onClose();
  }

  function handleItemClick(item: MenuItem) {
    item.action();
    onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Invisible backdrop to catch outside clicks -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100]"
  onclick={handleBackdropClick}
  oncontextmenu={(e) => { e.preventDefault(); handleBackdropClick(); }}
></div>

<!-- Context menu -->
<div
  bind:this={menuEl}
  class="fixed z-[101] min-w-[200px] py-1.5 rounded-lg border border-border glass-panel glow-border shadow-xl shadow-black/40 transition-opacity duration-100"
  class:opacity-0={!visible}
  class:opacity-100={visible}
  style:left="{adjustedX}px"
  style:top="{adjustedY}px"
>
  {#each items as item}
    {#if item.separator}
      <div class="my-1.5 border-t border-border"></div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex items-center gap-2.5 px-4 py-2 text-[13px] cursor-pointer transition-colors mx-1 rounded {item.danger ? 'text-error context-menu-danger' : 'text-text-primary hover:bg-bg-hover'}"
        onclick={() => handleItemClick(item)}
        role="menuitem"
      >
        {#if item.icon}
          <span class="w-4 text-center text-xs shrink-0">{item.icon}</span>
        {/if}
        <span>{item.label}</span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .context-menu-danger:hover {
    background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
  }
</style>
