<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { terminalInstances, activeTerminalId, addTerminal, removeTerminal } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { listen } from "@tauri-apps/api/event";
  import { spawnTerminal, writeTerminal, resizeTerminal, closeTerminal } from "$lib/utils/tauri";

  let terminals: Map<string, Terminal> = new Map();
  let fitAddons: Map<string, FitAddon> = new Map();
  let termContainerEl: HTMLDivElement;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;

  function handleNewTerminal() {
    const cwd = $workspacePath || "";
    addTerminal(cwd);
  }

  async function handleCloseTerminal(id: string) {
    // Close the PTY backend
    try {
      await closeTerminal(id);
    } catch (_) {
      // Session may already be gone
    }

    // Dispose the xterm instance
    const term = terminals.get(id);
    if (term) {
      term.dispose();
      terminals.delete(id);
      fitAddons.delete(id);
    }
    removeTerminal(id);
  }

  async function initTerminal(id: string, el: HTMLDivElement) {
    if (terminals.has(id)) return;

    const term = new Terminal({
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

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(el);
    fitAddon.fit();

    terminals.set(id, term);
    fitAddons.set(id, fitAddon);

    // Send keystrokes to the PTY backend
    term.onData((data: string) => {
      writeTerminal(id, data).catch((err) => {
        console.error(`Failed to write to terminal ${id}:`, err);
      });
    });

    // Notify backend when terminal is resized
    term.onResize(({ rows, cols }: { rows: number; cols: number }) => {
      resizeTerminal(id, rows, cols).catch((err) => {
        console.error(`Failed to resize terminal ${id}:`, err);
      });
    });

    // Spawn the PTY process
    const cwd = $workspacePath || "";
    const rows = term.rows;
    const cols = term.cols;

    try {
      await spawnTerminal(id, cwd, rows, cols);
    } catch (err) {
      term.writeln(`\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
    }
  }

  function handleResize() {
    const activeId = $activeTerminalId;
    if (activeId) {
      const fa = fitAddons.get(activeId);
      if (fa) try { fa.fit(); } catch (_) { /* ok */ }
    }
  }

  // Re-init terminals when instances change
  $effect(() => {
    const instances = $terminalInstances;
    tick().then(() => {
      for (const inst of instances) {
        const el = termContainerEl?.querySelector(`[data-term-id="${inst.id}"]`) as HTMLDivElement | null;
        if (el && !terminals.has(inst.id)) {
          initTerminal(inst.id, el);
        }
      }
    });
  });

  // Fit on active tab change
  $effect(() => {
    const activeId = $activeTerminalId;
    if (activeId) {
      setTimeout(() => {
        const fa = fitAddons.get(activeId);
        if (fa) try { fa.fit(); } catch (_) { /* ok */ }
      }, 100);
    }
  });

  onMount(async () => {
    window.addEventListener("resize", handleResize);

    // Listen for PTY output events from the Rust backend
    unlistenOutput = await listen<{ id: string; data: string }>("terminal-output", (event) => {
      const { id, data } = event.payload;
      const term = terminals.get(id);
      if (term) {
        term.write(data);
      }
    });

    // Listen for terminal-closed events (process exited)
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

    // Unsubscribe from Tauri events
    if (unlistenOutput) unlistenOutput();
    if (unlistenClosed) unlistenClosed();

    // Close all PTY sessions and dispose xterm instances
    for (const [id, term] of terminals.entries()) {
      closeTerminal(id).catch(() => {});
      term.dispose();
    }
    terminals.clear();
    fitAddons.clear();
  });
</script>

<div class="flex flex-col h-full bg-bg-tertiary" bind:this={termContainerEl}>
  <!-- Terminal tab bar -->
  <div class="flex items-center bg-bg-secondary border-b border-border min-h-[30px]">
    {#each $terminalInstances as inst (inst.id)}
      <div
        class="flex items-center gap-1.5 px-3 py-1 text-xs border-r border-border transition-colors group cursor-pointer"
        class:bg-bg-tertiary={$activeTerminalId === inst.id}
        class:text-text-primary={$activeTerminalId === inst.id}
        class:bg-bg-secondary={$activeTerminalId !== inst.id}
        class:text-text-muted={$activeTerminalId !== inst.id}
        onclick={() => activeTerminalId.set(inst.id)}
        role="tab"
        tabindex="0"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        {inst.title}
        <span
          class="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-opacity cursor-pointer"
          onclick={(e) => { e.stopPropagation(); handleCloseTerminal(inst.id); }}
          role="button"
          tabindex="0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </div>
    {/each}

    <button
      class="px-2 py-1 text-text-muted hover:text-text-primary transition-colors"
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
  <div class="flex-1 relative overflow-hidden">
    {#each $terminalInstances as inst (inst.id)}
      <div
        class="absolute inset-0 p-1"
        class:hidden={$activeTerminalId !== inst.id}
        data-term-id={inst.id}
      ></div>
    {/each}

    {#if $terminalInstances.length === 0}
      <div class="flex items-center justify-center h-full text-text-muted text-sm">
        <button onclick={handleNewTerminal} class="text-accent hover:text-accent-hover">
          + New Terminal
        </button>
      </div>
    {/if}
  </div>
</div>
