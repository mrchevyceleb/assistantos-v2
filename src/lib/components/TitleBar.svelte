<script lang="ts">
  import { onMount } from "svelte";

  let isMaximized = $state(false);
  let hoveredBtn = $state<"close" | "minimize" | "maximize" | null>(null);

  async function getWindow() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  }

  async function handleMinimize() {
    const win = await getWindow();
    await win.minimize();
  }

  async function handleMaximize() {
    const win = await getWindow();
    await win.toggleMaximize();
  }

  async function handleClose() {
    const win = await getWindow();
    await win.close();
  }

  async function handleDrag(e: MouseEvent) {
    // Only drag from the bar itself, not from buttons
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const win = await getWindow();
    await win.startDragging();
  }

  async function handleDoubleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    await handleMaximize();
  }

  onMount(() => {
    // Check initial maximized state
    getWindow().then(async (win) => {
      isMaximized = await win.isMaximized();
    });

    // Listen for resize changes
    let unlisten: (() => void) | null = null;
    getWindow().then(async (win) => {
      unlisten = await win.onResized(async () => {
        isMaximized = await win.isMaximized();
      });
    });

    return () => {
      if (unlisten) unlisten();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="titlebar flex items-center shrink-0 select-none"
  onmousedown={handleDrag}
  ondblclick={handleDoubleClick}
>
  <!-- Traffic lights -->
  <div class="flex items-center gap-2 ml-3.5" data-no-drag>
    <!-- Close -->
    <button
      class="traffic-light"
      style="background: {hoveredBtn === 'close' ? '#ff5f57' : '#ff5f57'};"
      onmouseenter={() => hoveredBtn = "close"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleClose}
      title="Close"
    >
      {#if hoveredBtn === "close"}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#4a0002" stroke-width="1.5">
          <line x1="1.5" y1="1.5" x2="6.5" y2="6.5"/>
          <line x1="6.5" y1="1.5" x2="1.5" y2="6.5"/>
        </svg>
      {/if}
    </button>

    <!-- Minimize -->
    <button
      class="traffic-light"
      style="background: {hoveredBtn === 'minimize' ? '#febc2e' : '#febc2e'};"
      onmouseenter={() => hoveredBtn = "minimize"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleMinimize}
      title="Minimize"
    >
      {#if hoveredBtn === "minimize"}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#9a6300" stroke-width="1.5">
          <line x1="1" y1="4" x2="7" y2="4"/>
        </svg>
      {/if}
    </button>

    <!-- Maximize -->
    <button
      class="traffic-light"
      style="background: {hoveredBtn === 'maximize' ? '#28c840' : '#28c840'};"
      onmouseenter={() => hoveredBtn = "maximize"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleMaximize}
      title={isMaximized ? "Restore" : "Maximize"}
    >
      {#if hoveredBtn === "maximize"}
        {#if isMaximized}
          <!-- Restore icon -->
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#006500" stroke-width="1.2">
            <rect x="1" y="2.5" width="4.5" height="4.5" rx="0.5"/>
            <path d="M2.5 2.5V1.5a.5.5 0 01.5-.5H7a.5.5 0 01.5.5V5.5a.5.5 0 01-.5.5h-1"/>
          </svg>
        {:else}
          <!-- Expand icon -->
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#006500" stroke-width="1.2">
            <path d="M1 2.5L4 0.5 7 2.5"/>
            <path d="M1 5.5L4 7.5 7 5.5"/>
          </svg>
        {/if}
      {/if}
    </button>
  </div>

  <!-- Center title -->
  <div class="flex-1 flex items-center justify-center pointer-events-none">
    <span class="titlebar-title">ASSISTANTOS</span>
  </div>

  <!-- Spacer to balance traffic lights -->
  <div class="w-[72px]"></div>
</div>

<style>
  .titlebar {
    height: 38px;
    background: linear-gradient(
      180deg,
      rgba(30, 34, 49, 0.6) 0%,
      rgba(18, 20, 28, 0.4) 100%
    );
    border-bottom: 1px solid rgba(0, 212, 255, 0.06);
    position: relative;
  }

  .titlebar::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 212, 255, 0.08) 30%,
      rgba(0, 212, 255, 0.08) 70%,
      transparent 100%
    );
  }

  .titlebar-title {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
    padding: 0;
  }

  .traffic-light:hover {
    opacity: 0.85;
  }

  .traffic-light:active {
    opacity: 0.65;
  }
</style>
