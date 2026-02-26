<script lang="ts">
  /**
   * Renders a single terminal instance inline as a document tab.
   * This component stays mounted (hidden via CSS) when the user switches tabs,
   * preserving the PTY session and xterm.js state.
   */
  import { onMount, onDestroy } from "svelte";
  import { terminalInstances, moveTerminal, removeTerminal } from "$lib/stores/terminal";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { listen } from "@tauri-apps/api/event";
  import { spawnTerminal, writeTerminal, resizeTerminal, closeTerminal } from "$lib/utils/tauri";
  import { workspacePath } from "$lib/stores/workspace";
  import { uiZoom } from "$lib/stores/ui";
  import { settings } from "$lib/stores/settings";

  interface Props {
    terminalId: string;
  }

  let { terminalId }: Props = $props();

  let BASE_TERM_FONT_SIZE = $derived($settings.terminalFontSize);

  const TERM_THEME = {
    background: "#0c0c14",
    foreground: "#cdd6f4",
    cursor: "#89b4fa",
    cursorAccent: "#0c0c14",
    selectionBackground: "#585b7066",
    selectionForeground: "#cdd6f4",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  };

  let containerEl: HTMLDivElement;
  let wrapperEl: HTMLDivElement;
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function handleMove(target: "bottom" | "right" | "left") {
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
    moveTerminal(terminalId, target);
  }

  onMount(async () => {
    term = new Terminal({
      theme: TERM_THEME,
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
    term.loadAddon(new WebLinksAddon());

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

    term.onData((data: string) => {
      writeTerminal(terminalId, data).catch(() => {});
    });

    term.onResize(({ rows, cols }) => {
      resizeTerminal(terminalId, rows, cols).catch(() => {});
    });

    unlistenOutput = await listen<{ id: string; data: string }>("terminal-output", (event) => {
      if (event.payload.id === terminalId && term) {
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
      closeTerminal(terminalId).catch(() => {});
      term.dispose();
      term = null;
      fitAddon = null;
    }
    removeTerminal(terminalId);
  });
</script>

<div class="term-tab-wrapper flex flex-col h-full" bind:this={wrapperEl}>
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

<style>
  .term-tab-wrapper {
    background: #0c0c14;
    position: relative;
  }

  .term-tab-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: #0a0a12;
    border-bottom: 1px solid #1a1a2e;
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
    background: #1a1a2e;
  }

  .term-tab-viewport {
    background: #08080e;
    padding: 6px 8px 8px 8px;
    overflow: hidden;
  }

  .term-tab-content {
    height: 100%;
    border: 1px solid #1e1e30;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
