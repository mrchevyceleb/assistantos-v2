<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import {
    terminalInstances,
    activeTerminalId,
    activeRightTerminalId,
    activeLeftTerminalId,
    bottomTerminals,
    rightTerminals,
    leftTerminals,
    addTerminal,
    removeTerminal,
    moveTerminal,
    appendTerminalBuffer,
    getTerminalBuffer,
    clearTerminalBuffer,
    type TerminalDock,
  } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { uiZoom } from "$lib/stores/ui";
  import { settings } from "$lib/stores/settings";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { listen } from "@tauri-apps/api/event";
  import { spawnTerminal, writeTerminal, resizeTerminal, closeTerminal } from "$lib/utils/tauri";
  import { getTerminalTheme, type TerminalStylePreset } from "$lib/utils/terminal-theme";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  interface Props {
    dock?: TerminalDock;
  }

  let { dock = "bottom" }: Props = $props();

  // Use settings for base font size (the zoom effect multiplies this)
  let BASE_TERM_FONT_SIZE = $derived($settings.terminalFontSize);

  let terminals: Map<string, Terminal> = new Map();
  let fitAddons: Map<string, FitAddon> = new Map();
  // Track which terminal IDs have been spawned on the Rust backend
  // so we never double-spawn and kill an existing PTY session
  let spawnedIds: Set<string> = new Set();
  let termContainerEl: HTMLDivElement;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;

  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    termId: string | null;
  }>({ visible: false, x: 0, y: 0, termId: null });

  // Select the right list and active ID based on dock position
  let instances = $derived(
    dock === "right" ? $rightTerminals :
    dock === "left" ? $leftTerminals :
    $bottomTerminals
  );
  let currentActiveId = $derived(
    dock === "right" ? $activeRightTerminalId :
    dock === "left" ? $activeLeftTerminalId :
    $activeTerminalId
  );

  let terminalPreset = $derived($settings.terminalStylePreset as TerminalStylePreset);

  function closeContextMenu() {
    contextMenu = { visible: false, x: 0, y: 0, termId: null };
  }

  async function writeClipboardText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  async function readClipboardText(): Promise<string> {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }

  function getContextMenuItems(termId: string): MenuItem[] {
    const term = terminals.get(termId);
    const hasSelection = !!term?.hasSelection();
    return [
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        disabled: !hasSelection,
        action: () => {
          if (term && term.hasSelection()) {
            writeClipboardText(term.getSelection());
          }
        },
      },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        action: async () => {
          const text = await readClipboardText();
          if (text) {
            await writeTerminal(termId, text);
          }
        },
      },
      {
        label: "Select All",
        action: () => term?.selectAll(),
      },
      {
        label: "Clear",
        action: () => term?.clear(),
      },
    ];
  }

  function setActiveId(id: string) {
    if (dock === "right") {
      activeRightTerminalId.set(id);
    } else if (dock === "left") {
      activeLeftTerminalId.set(id);
    } else {
      activeTerminalId.set(id);
    }
  }

  function handleNewTerminal() {
    const cwd = $workspacePath || "";
    addTerminal(cwd, dock);
  }

  async function handleCloseTerminal(id: string) {
    const inst = $terminalInstances.find((t) => t.id === id);
    if (!window.confirm(`Close ${inst?.title || "terminal"}? This will end the session.`)) {
      return;
    }

    try {
      await closeTerminal(id);
    } catch (_) {}

    clearTerminalBuffer(id);
    spawnedIds.delete(id);

    const term = terminals.get(id);
    if (term) {
      term.dispose();
      terminals.delete(id);
      fitAddons.delete(id);
    }
    removeTerminal(id);
  }

  function handleMove(id: string, target: TerminalDock) {
    const term = terminals.get(id);
    if (term) {
      term.dispose();
      terminals.delete(id);
      fitAddons.delete(id);
    }
    moveTerminal(id, target);
  }

  async function initTerminal(id: string, el: HTMLDivElement) {
    if (terminals.has(id)) return;

    const term = new Terminal({
      theme: getTerminalTheme(terminalPreset),
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: Math.round($settings.terminalFontSize * $uiZoom),
      fontWeight: "400",
      fontWeightBold: "600",
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: $settings.terminalCursorStyle,
      cursorWidth: 2,
      scrollback: 5000,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      convertEol: false,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(el);

    // Try loading WebGL renderer for smoother rendering (dynamic import to avoid crashes)
    try {
      const { WebglAddon } = await import("@xterm/addon-webgl");
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => { webglAddon.dispose(); });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available or addon incompatible — canvas renderer is fine
    }

    fitAddon.fit();

    // Replay buffered output (preserves scrollback when moving between docks)
    const buf = getTerminalBuffer(id);
    if (buf) {
      term.write(buf);
    }

    terminals.set(id, term);
    fitAddons.set(id, fitAddon);

    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const mod = ev.ctrlKey || ev.metaKey;
      const key = ev.key.toLowerCase();
      if (mod && key === "c" && ev.type === "keydown") {
        if (term.hasSelection()) {
          writeClipboardText(term.getSelection());
        } else {
          writeTerminal(id, "\u0003").catch(() => {});
        }
        return false;
      }

      if (mod && key === "v" && ev.type === "keydown") {
        readClipboardText().then((text) => {
          if (text) {
            writeTerminal(id, text).catch(() => {});
          }
        });
        return false;
      }

      return true;
    });

    // Block native paste event — we handle Ctrl+V manually above via
    // attachCustomKeyEventHandler + readClipboardText. Without this, the
    // browser also fires a 'paste' event that xterm processes separately,
    // causing double-paste.
    el.addEventListener("paste", (e) => {
      e.preventDefault();
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      contextMenu = { visible: true, x: e.clientX, y: e.clientY, termId: id };
    });

    term.onData((data: string) => {
      writeTerminal(id, data).catch((err) => {
        console.error(`Failed to write to terminal ${id}:`, err);
      });
    });

    term.onResize(({ rows, cols }: { rows: number; cols: number }) => {
      resizeTerminal(id, rows, cols).catch((err) => {
        console.error(`Failed to resize terminal ${id}:`, err);
      });
    });

    // Only spawn a new PTY if we haven't already spawned one for this ID.
    if (!spawnedIds.has(id)) {
      const inst = $terminalInstances.find((t) => t.id === id);
      if (inst) {
        const cwd = inst.cwd || $workspacePath || "";
        const rows = term.rows;
        const cols = term.cols;

        try {
          await spawnTerminal(id, cwd, rows, cols, $settings.defaultShell);
          spawnedIds.add(id);
        } catch (err) {
          const errStr = String(err);
          if (errStr.includes("already exists")) {
            spawnedIds.add(id);
            try {
              await resizeTerminal(id, term.rows, term.cols);
            } catch { /* ok — resize is best-effort */ }
          } else {
            term.writeln(`\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
          }
        }
      }
    } else {
      try {
        await resizeTerminal(id, term.rows, term.cols);
      } catch { /* ok */ }
    }
  }

  function handleResize() {
    if (currentActiveId) {
      const fa = fitAddons.get(currentActiveId);
      if (fa) try { fa.fit(); } catch (_) { /* ok */ }
    }
  }

  // Re-init terminals when instances change
  $effect(() => {
    const insts = instances;
    tick().then(() => {
      for (const inst of insts) {
        const el = termContainerEl?.querySelector(`[data-term-id="${inst.id}"]`) as HTMLDivElement | null;
        if (el && !terminals.has(inst.id)) {
          initTerminal(inst.id, el);
        }
      }
    });
  });

  // Update terminal font size when zoom changes
  $effect(() => {
    const zoom = $uiZoom;
    const newSize = Math.round(BASE_TERM_FONT_SIZE * zoom);
    for (const [id, term] of terminals.entries()) {
      term.options.fontSize = newSize;
      term.options.theme = getTerminalTheme(terminalPreset);
      const fa = fitAddons.get(id);
      if (fa) try { fa.fit(); } catch {}
    }
  });

  // Fit on active tab change
  $effect(() => {
    const activeId = currentActiveId;
    if (activeId) {
      setTimeout(() => {
        const fa = fitAddons.get(activeId);
        if (fa) try { fa.fit(); } catch (_) { /* ok */ }
      }, 100);
    }
  });

  onMount(async () => {
    window.addEventListener("resize", handleResize);

    unlistenOutput = await listen<{ id: string; data: string }>("terminal-output", (event) => {
      const { id, data } = event.payload;
      const term = terminals.get(id);
      if (term) {
        appendTerminalBuffer(id, data);
        term.write(data);
      }
    });

    unlistenClosed = await listen<{ id: string; exit_code: number | null }>("terminal-closed", (event) => {
      const { id } = event.payload;
      const term = terminals.get(id);
      if (term) {
        term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      }
    });
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    if (unlistenOutput) unlistenOutput();
    if (unlistenClosed) unlistenClosed();

    for (const [, term] of terminals.entries()) {
      term.dispose();
    }
    terminals.clear();
    fitAddons.clear();
  });
</script>

<div class="term-panel flex flex-col h-full" class:term-minimal={terminalPreset === "minimal"} class:term-retro={terminalPreset === "retro"} class:term-high-contrast={terminalPreset === "high-contrast"} bind:this={termContainerEl}>
  <!-- Terminal tab bar -->
  <div class="term-tabbar flex items-center">
    {#each instances as inst (inst.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="term-tab group"
        class:active={currentActiveId === inst.id}
        onclick={() => setActiveId(inst.id)}
        role="tab"
        tabindex="0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="term-tab-icon">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span class="term-tab-label">{inst.title}</span>

        <!-- Dock move buttons (visible on hover) -->
        <span class="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {#if dock !== "bottom"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="term-tab-action"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "bottom"); }}
              title="Move to bottom panel"
              role="button"
              tabindex="0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
              </svg>
            </span>
          {/if}
          {#if dock !== "left"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="term-tab-action"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "left"); }}
              title="Move to left panel"
              role="button"
              tabindex="0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </span>
          {/if}
          {#if dock !== "right"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="term-tab-action"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "right"); }}
              title="Move to right panel"
              role="button"
              tabindex="0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </span>
          {/if}
          {#if dock !== "tab"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="term-tab-action"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "tab"); }}
              title="Open as tab"
              role="button"
              tabindex="0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
              </svg>
            </span>
          {/if}
        </span>

        <!-- Close button -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span
          class="term-tab-close"
          onclick={(e) => { e.stopPropagation(); handleCloseTerminal(inst.id); }}
          role="button"
          tabindex="0"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </div>
    {/each}

    <button
      class="term-new-btn"
      onclick={handleNewTerminal}
      title="New Terminal"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  <!-- Terminal instances -->
  <div class="flex-1 relative overflow-hidden term-viewport">
    {#each instances as inst (inst.id)}
      <div
        class="absolute inset-0 term-container"
        class:hidden={currentActiveId !== inst.id}
        data-term-id={inst.id}
      ></div>
    {/each}

    {#if instances.length === 0}
      <div class="flex items-center justify-center h-full">
        <button onclick={handleNewTerminal} class="term-empty-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-60">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          New Terminal
        </button>
      </div>
    {/if}
  </div>
</div>

{#if contextMenu.visible && contextMenu.termId}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems(contextMenu.termId)}
    onClose={closeContextMenu}
  />
{/if}

<style>
  .term-panel {
    background: #08090e;
  }

  .term-panel.term-minimal {
    background: #0a0b10;
  }

  .term-panel.term-retro {
    background: #081109;
  }

  .term-panel.term-high-contrast {
    background: #030305;
  }

  /* ── Tab bar ─────────────────────────────────────────────────────── */
  .term-tabbar {
    background:
      linear-gradient(180deg, rgba(57, 64, 80, 0.76) 0%, rgba(20, 24, 35, 0.92) 52%, rgba(11, 13, 19, 0.96) 100%),
      repeating-linear-gradient(95deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 2px, rgba(0, 0, 0, 0.012) 2px, rgba(0, 0, 0, 0.012) 4px);
    border-bottom: 1px solid #293246;
    min-height: 40px;
    padding: 0 6px;
    gap: 2px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -2px 0 rgba(0, 0, 0, 0.5);
  }

  .term-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    font-size: 12.5px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    border-radius: 6px 6px 0 0;
    margin-top: 4px;
    position: relative;
    white-space: nowrap;
  }

  .term-tab:hover {
    color: var(--color-text-secondary);
    background: linear-gradient(180deg, rgba(34, 39, 56, 0.56) 0%, rgba(14, 17, 27, 0.65) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  .term-tab.active {
    color: var(--color-text-primary);
    background:
      linear-gradient(180deg, rgba(63, 71, 90, 0.76) 0%, rgba(26, 31, 44, 0.95) 46%, rgba(13, 16, 26, 0.98) 100%),
      linear-gradient(130deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.04) 44%, transparent 70%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      inset 0 -1px 0 rgba(0, 0, 0, 0.66),
      inset 1px 0 0 rgba(255, 255, 255, 0.05),
      inset -1px 0 0 rgba(0, 0, 0, 0.34),
      0 8px 18px rgba(0, 0, 0, 0.32);
  }

  .term-tab.active::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 8px;
    right: 8px;
    height: 3px;
    background: var(--color-accent);
    border-radius: 2px 2px 0 0;
  }

  .term-tab-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .term-tab.active .term-tab-icon {
    opacity: 0.8;
    color: var(--color-accent);
  }

  .term-tab-label {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .term-tab-action {
    padding: 2px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .term-tab-action:hover {
    background: var(--color-bg-hover);
  }

  .term-tab-close {
    padding: 2px;
    border-radius: 3px;
    opacity: 0;
    transition: all 0.1s;
    cursor: pointer;
    margin-left: 2px;
  }

  .term-tab-close:hover {
    background: rgba(243, 139, 168, 0.2);
    color: var(--color-error);
  }

  :global(.group:hover) .term-tab-close {
    opacity: 1;
  }

  .term-new-btn {
    color: var(--color-text-muted);
    padding: 6px 10px;
    transition: all 0.15s;
    border-radius: 4px;
    margin-left: 2px;
  }

  .term-new-btn:hover {
    color: var(--color-text-primary);
    background: #13131f;
  }

  /* ── Terminal viewport ───────────────────────────────────────────── */
  .term-viewport {
    background: linear-gradient(180deg, #090b13 0%, #06070f 100%);
    padding: 7px 9px 9px 9px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.52);
  }

  .term-container {
    border: 1px solid #313c55;
    border-radius: 8px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 0 30px rgba(88, 180, 208, 0.045),
      0 8px 16px rgba(0, 0, 0, 0.3);
  }

  .term-empty-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px dashed #1a1a2e;
    transition: all 0.2s;
    background: transparent;
  }

  .term-empty-btn:hover {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: rgba(88, 180, 208, 0.05);
  }
</style>
