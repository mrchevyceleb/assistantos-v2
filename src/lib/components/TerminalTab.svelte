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

  interface Props {
    terminalId: string;
  }

  let { terminalId }: Props = $props();

  let containerEl: HTMLDivElement;
  let wrapperEl: HTMLDivElement;
  let term: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function handleMove(target: "bottom" | "right") {
    // Dispose xterm before moving
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
    moveTerminal(terminalId, target);
  }

  onMount(async () => {
    term = new Terminal({
      theme: {
        background: "#11111b",
        foreground: "#cdd6f4",
        cursor: "#89b4fa",
        selectionBackground: "#45475a",
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
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: false,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerEl);
    fitAddon.fit();

    term.onData((data: string) => {
      writeTerminal(terminalId, data).catch(() => {});
    });

    term.onResize(({ rows, cols }) => {
      resizeTerminal(terminalId, rows, cols).catch(() => {});
    });

    // Listen for output for this terminal
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

    // Spawn PTY
    const inst = $terminalInstances.find((t) => t.id === terminalId);
    const cwd = inst?.cwd || $workspacePath || "";
    try {
      await spawnTerminal(terminalId, cwd, term.rows, term.cols);
    } catch {
      // Already spawned — just resize
      try {
        await resizeTerminal(terminalId, term.rows, term.cols);
      } catch {}
    }

    // Use ResizeObserver to refit when the container becomes visible again
    // (parent toggles between hidden/visible via CSS)
    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && wrapperEl && wrapperEl.offsetHeight > 0) {
        try { fitAddon.fit(); } catch {}
      }
    });
    resizeObserver.observe(wrapperEl);

    // Also refit on window resize
    window.addEventListener("resize", handleResize);
  });

  function handleResize() {
    if (fitAddon) try { fitAddon.fit(); } catch {}
  }

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    if (resizeObserver) resizeObserver.disconnect();
    if (unlistenOutput) unlistenOutput();
    if (unlistenClosed) unlistenClosed();
    // With the always-mounted approach in ContentArea, onDestroy only fires
    // when the terminal tab is actually removed from the tabs store (user closed it).
    // So it's safe to kill the PTY here.
    if (term) {
      closeTerminal(terminalId).catch(() => {});
      term.dispose();
      term = null;
      fitAddon = null;
    }
    // Also clean up the terminal instance from the terminal store
    removeTerminal(terminalId);
  });
</script>

<div class="flex flex-col h-full bg-bg-tertiary" bind:this={wrapperEl}>
  <!-- Mini toolbar -->
  <div class="flex items-center gap-2 px-3 py-1 bg-bg-secondary border-b border-border">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
    <span class="text-xs text-text-secondary">Terminal</span>
    <span class="ml-auto flex items-center gap-1">
      <button
        class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-bg-hover transition-colors"
        onclick={() => handleMove("bottom")}
        title="Move to bottom panel"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
        </svg>
      </button>
      <button
        class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-bg-hover transition-colors"
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
  <div class="flex-1 p-1" bind:this={containerEl}></div>
</div>
