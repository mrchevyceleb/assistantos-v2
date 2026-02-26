<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import {
    terminalInstances,
    activeTerminalId,
    activeRightTerminalId,
    bottomTerminals,
    rightTerminals,
    addTerminal,
    removeTerminal,
    moveTerminal,
    type TerminalDock,
  } from "$lib/stores/terminal";
  import { workspacePath } from "$lib/stores/workspace";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { listen } from "@tauri-apps/api/event";
  import { spawnTerminal, writeTerminal, resizeTerminal, closeTerminal } from "$lib/utils/tauri";

  interface Props {
    dock?: TerminalDock;
  }

  let { dock = "bottom" }: Props = $props();

  let terminals: Map<string, Terminal> = new Map();
  let fitAddons: Map<string, FitAddon> = new Map();
  // Track which terminal IDs have been spawned on the Rust backend
  // so we never double-spawn and kill an existing PTY session
  let spawnedIds: Set<string> = new Set();
  let termContainerEl: HTMLDivElement;
  let unlistenOutput: (() => void) | null = null;
  let unlistenClosed: (() => void) | null = null;

  // Select the right list and active ID based on dock position
  let instances = $derived(dock === "right" ? $rightTerminals : $bottomTerminals);
  let currentActiveId = $derived(dock === "right" ? $activeRightTerminalId : $activeTerminalId);

  function setActiveId(id: string) {
    if (dock === "right") {
      activeRightTerminalId.set(id);
    } else {
      activeTerminalId.set(id);
    }
  }

  function handleNewTerminal() {
    const cwd = $workspacePath || "";
    addTerminal(cwd, dock);
  }

  async function handleCloseTerminal(id: string) {
    try {
      await closeTerminal(id);
    } catch (_) {}

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
    // The terminal xterm instance needs to be re-attached after moving
    // Dispose the current DOM attachment — it will re-init in the new container
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
    // When switching tabs or re-docking, the xterm.js Terminal gets disposed
    // but the Rust PTY session stays alive. We just need to re-attach.
    if (!spawnedIds.has(id)) {
      const inst = $terminalInstances.find((t) => t.id === id);
      if (inst) {
        const cwd = inst.cwd || $workspacePath || "";
        const rows = term.rows;
        const cols = term.cols;

        try {
          await spawnTerminal(id, cwd, rows, cols);
          spawnedIds.add(id);
        } catch (err) {
          // Rust returned "already exists" — the PTY is still alive, just reconnect
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
      // Already spawned — just resize to fit the new container
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

    // Only dispose xterm.js instances — do NOT kill PTY sessions.
    // The component may be unmounted temporarily (e.g. toggling terminal panel visibility)
    // and we want the PTY to survive. PTY sessions are only killed explicitly
    // via handleCloseTerminal or when the app fully shuts down.
    for (const [, term] of terminals.entries()) {
      term.dispose();
    }
    terminals.clear();
    fitAddons.clear();
    // Do NOT clear spawnedIds — the Rust PTY sessions are still alive
  });
</script>

<div class="flex flex-col h-full bg-bg-tertiary" bind:this={termContainerEl}>
  <!-- Terminal tab bar -->
  <div class="flex items-center bg-bg-secondary border-b border-border" style="min-height: 40px;">
    {#each instances as inst (inst.id)}
      <div
        class="flex items-center gap-2.5 border-r border-border transition-colors group cursor-pointer"
        style="padding: 8px 16px; font-size: 13px;"
        class:bg-bg-tertiary={currentActiveId === inst.id}
        class:text-text-primary={currentActiveId === inst.id}
        class:bg-bg-secondary={currentActiveId !== inst.id}
        class:text-text-muted={currentActiveId !== inst.id}
        onclick={() => setActiveId(inst.id)}
        role="tab"
        tabindex="0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        {inst.title}

        <!-- Dock move buttons (visible on hover) -->
        <span class="flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {#if dock !== "bottom"}
            <span
              class="p-0.5 rounded hover:bg-bg-active cursor-pointer"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "bottom"); }}
              title="Move to bottom panel"
              role="button"
              tabindex="0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
              </svg>
            </span>
          {/if}
          {#if dock !== "right"}
            <span
              class="p-0.5 rounded hover:bg-bg-active cursor-pointer"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "right"); }}
              title="Move to right panel"
              role="button"
              tabindex="0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </span>
          {/if}
          {#if dock !== "tab"}
            <span
              class="p-0.5 rounded hover:bg-bg-active cursor-pointer"
              onclick={(e) => { e.stopPropagation(); handleMove(inst.id, "tab"); }}
              title="Open as tab"
              role="button"
              tabindex="0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
              </svg>
            </span>
          {/if}
        </span>

        <!-- Close button -->
        <span
          class="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-opacity cursor-pointer"
          onclick={(e) => { e.stopPropagation(); handleCloseTerminal(inst.id); }}
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

    <button
      class="text-text-muted hover:text-text-primary transition-colors"
      style="padding: 8px 14px;"
      onclick={handleNewTerminal}
      title="New Terminal"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  <!-- Terminal instances -->
  <div class="flex-1 relative overflow-hidden">
    {#each instances as inst (inst.id)}
      <div
        class="absolute inset-0 p-1"
        class:hidden={currentActiveId !== inst.id}
        data-term-id={inst.id}
      ></div>
    {/each}

    {#if instances.length === 0}
      <div class="flex items-center justify-center h-full text-text-muted text-base">
        <button onclick={handleNewTerminal} class="text-accent hover:text-accent-hover">
          + New Terminal
        </button>
      </div>
    {/if}
  </div>
</div>
