<script lang="ts">
  import { onMount } from "svelte";

  const isDev = import.meta.env.DEV;

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
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const win = await getWindow();
    await win.startDragging();
  }

  async function handleDoubleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    await handleMaximize();
  }

  onMount(() => {
    getWindow().then(async (win) => {
      isMaximized = await win.isMaximized();
    });

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
  <!-- Left spacer to balance window controls -->
  <div class="w-[138px] shrink-0"></div>

  <!-- Center title -->
  <div class="flex-1 flex items-center justify-center pointer-events-none">
    <span class="titlebar-title">ASSISTANTOS</span>
    {#if isDev}
      <span class="titlebar-badge">DEV</span>
    {/if}
  </div>

  <!-- Windows-style window controls (right side) -->
  <div class="flex items-center shrink-0" data-no-drag>
    <!-- Minimize -->
    <button
      class="win-btn"
      class:win-btn-hover={hoveredBtn === "minimize"}
      onmouseenter={() => hoveredBtn = "minimize"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleMinimize}
      title="Minimize"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1"/>
      </svg>
    </button>

    <!-- Maximize / Restore -->
    <button
      class="win-btn"
      class:win-btn-hover={hoveredBtn === "maximize"}
      onmouseenter={() => hoveredBtn = "maximize"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleMaximize}
      title={isMaximized ? "Restore Down" : "Maximize"}
    >
      {#if isMaximized}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
          <rect x="0.5" y="2.5" width="7" height="7" rx="0.5"/>
          <path d="M2.5 2.5V1a.5.5 0 01.5-.5H9.5A.5.5 0 0110 1V7.5a.5.5 0 01-.5.5H7.5"/>
        </svg>
      {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
        </svg>
      {/if}
    </button>

    <!-- Close -->
    <button
      class="win-btn win-btn-close"
      class:win-btn-close-hover={hoveredBtn === "close"}
      onmouseenter={() => hoveredBtn = "close"}
      onmouseleave={() => hoveredBtn = null}
      onclick={handleClose}
      title="Close"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2">
        <line x1="1" y1="1" x2="9" y2="9"/>
        <line x1="9" y1="1" x2="1" y2="9"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .titlebar {
    height: 42px;
    background: linear-gradient(
      180deg,
      rgba(30, 34, 49, 0.6) 0%,
      rgba(18, 20, 28, 0.4) 100%
    );
    border-bottom: 1px solid rgba(88, 180, 208, 0.06);
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
      rgba(88, 180, 208, 0.08) 30%,
      rgba(88, 180, 208, 0.08) 70%,
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

  .titlebar-badge {
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 9px;
    letter-spacing: 0.08em;
    color: #0b0d13;
    background: linear-gradient(180deg, #9bd9ec 0%, #58b4d0 100%);
    box-shadow: 0 0 0 1px rgba(88, 180, 208, 0.35);
  }

  .win-btn {
    width: 46px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    padding: 0;
  }

  .win-btn-hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text-primary);
  }

  .win-btn-close-hover {
    background: #c42b1c !important;
    color: #ffffff !important;
  }

  .win-btn:active {
    background: rgba(255, 255, 255, 0.04);
  }

  .win-btn-close:active {
    background: #b22a1a !important;
  }
</style>
