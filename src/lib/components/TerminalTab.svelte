<script lang="ts">
  /**
   * Renders a single terminal instance inline as a document tab.
   * This component stays mounted (hidden via CSS) when the user switches tabs,
   * preserving the PTY session and xterm.js state.
   */
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { terminalInstances, moveTerminal, removeTerminal, appendTerminalBuffer, getTerminalBuffer, clearTerminalBuffer } from "$lib/stores/terminal";
  import { tabs } from "$lib/stores/tabs";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { listen } from "@tauri-apps/api/event";
  import { spawnTerminal, writeTerminal, resizeTerminal, closeTerminal } from "$lib/utils/tauri";
  import { terminalLinkHandler, handleCtrlClick } from "$lib/utils/link-handler";
  import { workspacePath } from "$lib/stores/workspace";
  import { uiZoom } from "$lib/stores/ui";
  import { settings } from "$lib/stores/settings";
  import { getTerminalTheme, type TerminalStylePreset } from "$lib/utils/terminal-theme";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  interface Props {
    terminalId: string;
  }

  let { terminalId }: Props = $props();

  let BASE_TERM_FONT_SIZE = $derived($settings.terminalFontSize);

  let containerEl: HTMLDivElement;
  let wrapperEl: HTMLDivElement;
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let movedAway = false;
  let terminalPreset = $derived($settings.terminalStylePreset as TerminalStylePreset);

  let contextMenu = $state({
    visible: false,
    x: 0,
    y: 0,
  });

  function closeContextMenu() {
    contextMenu = { visible: false, x: 0, y: 0 };
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

  function getContextMenuItems(): MenuItem[] {
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
            await writeTerminal(terminalId, text);
          }
        },
      },
      { label: "Select All", action: () => term?.selectAll() },
      { label: "Clear", action: () => term?.clear() },
    ];
  }

  function handleMove(target: "bottom" | "right" | "left") {
    movedAway = true;
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
    moveTerminal(terminalId, target);
  }

  onMount(async () => {
    term = new Terminal({
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

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon(terminalLinkHandler));

    term.open(containerEl);

    try {
      const { WebglAddon } = await import("@xterm/addon-webgl");
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => { webglAddon.dispose(); });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available or addon incompatible — canvas renderer is fine
    }

    fitAddon.fit();

    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const mod = ev.ctrlKey || ev.metaKey;
      const key = ev.key.toLowerCase();
      if (mod && key === "c" && ev.type === "keydown") {
        if (term && term.hasSelection()) {
          writeClipboardText(term.getSelection());
        } else {
          writeTerminal(terminalId, "\u0003").catch(() => {});
        }
        return false;
      }

      if (mod && key === "v" && ev.type === "keydown") {
        readClipboardText().then((text) => {
          if (text) {
            writeTerminal(terminalId, text).catch(() => {});
          }
        });
        return false;
      }
      return true;
    });

    // Block native paste event in capture phase — we handle Ctrl+V manually
    // above via attachCustomKeyEventHandler + readClipboardText. Without this,
    // xterm's internal textarea processes the paste event before it bubbles to
    // the container, causing double-paste.
    containerEl.addEventListener("paste", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    containerEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      contextMenu = { visible: true, x: e.clientX, y: e.clientY };
    });

    // Ctrl+Click to open file paths and URLs
    containerEl.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) {
        handleCtrlClick(e, containerEl);
      }
    });

    // Replay buffered output (preserves scrollback when moving between docks)
    const buf = getTerminalBuffer(terminalId);
    if (buf) {
      term.write(buf);
    }

    term.onData((data: string) => {
      writeTerminal(terminalId, data).catch(() => {});
    });

    term.onResize(({ rows, cols }) => {
      resizeTerminal(terminalId, rows, cols).catch(() => {});
    });

    unlistenOutput = await listen<{ id: string; data: string }>("terminal-output", (event) => {
      if (event.payload.id === terminalId && term) {
        appendTerminalBuffer(terminalId, event.payload.data);
        term.write(event.payload.data);
      }
    });

    unlistenClosed = await listen<{ id: string; exit_code: number | null }>("terminal-closed", (event) => {
      if (event.payload.id === terminalId && term) {
        term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      }
    });

    const inst = $terminalInstances.find((t) => t.id === terminalId);
    const cwd = inst?.cwd || $workspacePath || "";
    try {
      await spawnTerminal(terminalId, cwd, term.rows, term.cols, $settings.defaultShell);
    } catch {
      try {
        await resizeTerminal(terminalId, term.rows, term.cols);
      } catch {}
    }

    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && wrapperEl && wrapperEl.offsetHeight > 0) {
        try { fitAddon.fit(); } catch {}
      }
    });
    resizeObserver.observe(wrapperEl);

    window.addEventListener("resize", handleResize);
  });

  // Update terminal font size when zoom changes
  $effect(() => {
    const zoom = $uiZoom;
    if (term && fitAddon) {
      term.options.fontSize = Math.round(BASE_TERM_FONT_SIZE * zoom);
      term.options.theme = getTerminalTheme(terminalPreset);
      try { fitAddon.fit(); } catch {}
    }
  });

  function handleResize() {
    if (fitAddon) try { fitAddon.fit(); } catch {}
  }

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (unlistenOutput) unlistenOutput();
    if (unlistenClosed) unlistenClosed();
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }

    const terminalTabPath = `__terminal__:${terminalId}`;
    const tabStillExists = get(tabs).some((t) => t.path === terminalTabPath);

    // Only terminate when the terminal tab was intentionally closed.
    // Component remounts and dock moves should preserve the backend PTY.
    if (!movedAway && !tabStillExists) {
      closeTerminal(terminalId).catch(() => {});
      clearTerminalBuffer(terminalId);
      removeTerminal(terminalId);
    }
  });
</script>

<div class="term-tab-wrapper flex flex-col h-full" class:term-minimal={terminalPreset === "minimal"} class:term-retro={terminalPreset === "retro"} class:term-high-contrast={terminalPreset === "high-contrast"} bind:this={wrapperEl}>
  <!-- Mini toolbar -->
  <div class="term-tab-toolbar">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="term-tab-toolbar-icon">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
    <span class="term-tab-toolbar-label">Terminal</span>
    <span class="ml-auto flex items-center gap-1">
      <button
        class="term-tab-toolbar-btn"
        onclick={() => handleMove("bottom")}
        title="Move to bottom panel"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
        </svg>
      </button>
      <button
        class="term-tab-toolbar-btn"
        onclick={() => handleMove("left")}
        title="Move to left panel"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>
      <button
        class="term-tab-toolbar-btn"
        onclick={() => handleMove("right")}
        title="Move to right panel"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </button>
    </span>
  </div>

  <!-- Terminal area -->
  <div class="flex-1 term-tab-viewport">
    <div class="term-tab-content" bind:this={containerEl}></div>
  </div>
</div>

{#if contextMenu.visible}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getContextMenuItems()}
    onClose={closeContextMenu}
  />
{/if}

<style>
  .term-tab-wrapper {
    background: #08090e;
    position: relative;
  }

  .term-tab-wrapper.term-minimal {
    background: #0a0b10;
  }

  .term-tab-wrapper.term-retro {
    background: #081109;
  }

  .term-tab-wrapper.term-high-contrast {
    background: #030305;
  }

  .term-tab-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background:
      linear-gradient(180deg, rgba(57, 64, 80, 0.76) 0%, rgba(20, 24, 35, 0.92) 52%, rgba(11, 13, 19, 0.96) 100%),
      repeating-linear-gradient(95deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 2px, rgba(0, 0, 0, 0.012) 2px, rgba(0, 0, 0, 0.012) 4px);
    border-bottom: 1px solid #293246;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      inset 0 -2px 0 rgba(0, 0, 0, 0.5);
  }

  .term-tab-toolbar-icon {
    color: var(--color-accent);
    opacity: 0.6;
  }

  .term-tab-toolbar-label {
    font-size: 12px;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }

  .term-tab-toolbar-btn {
    color: var(--color-text-muted);
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .term-tab-toolbar-btn:hover {
    color: var(--color-text-primary);
    background: linear-gradient(180deg, rgba(34, 39, 56, 0.56) 0%, rgba(14, 17, 27, 0.65) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  .term-tab-viewport {
    background: linear-gradient(180deg, #090b13 0%, #06070f 100%);
    padding: 7px 9px 9px 9px;
    overflow: hidden;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.52);
  }

  .term-tab-content {
    height: 100%;
    border: 1px solid #313c55;
    border-radius: 8px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 0 30px rgba(88, 180, 208, 0.045),
      0 8px 16px rgba(0, 0, 0, 0.3);
  }
</style>
