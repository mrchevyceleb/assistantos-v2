<script lang="ts">
  import { settings, updateSetting } from "$lib/stores/settings";
  import type { AppSettings } from "$lib/stores/settings";
  import { uiZoom, applyZoom } from "$lib/stores/ui";

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();

  type Category = "Terminal" | "Editor" | "Appearance" | "File Explorer" | "General";

  let activeCategory = $state<Category>("Terminal");

  const categories: Category[] = [
    "Terminal",
    "Editor",
    "Appearance",
    "File Explorer",
    "General",
  ];

  const categoryIcons: Record<Category, string> = {
    Terminal: "M4 17l6-6-6-6M12 19h8",
    Editor: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7",
    Appearance: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    "File Explorer": "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    General: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
  >
    <div class="w-[720px] max-h-[80vh] bg-bg-primary border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 class="text-text-primary text-base font-semibold">Settings</h2>
        <button
          class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          onclick={onClose}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Body: sidebar + content -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left sidebar -->
        <div class="w-[180px] border-r border-border py-2 shrink-0">
          {#each categories as cat}
            <button
              class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors
                {activeCategory === cat ? 'bg-bg-hover text-text-primary border-l-2 border-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary border-l-2 border-transparent'}"
              onclick={() => activeCategory = cat}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                <path d={categoryIcons[cat]}/>
              </svg>
              {cat}
            </button>
          {/each}
        </div>

        <!-- Right content -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          {#if activeCategory === "Terminal"}
            <!-- Default dock position -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Default dock position</div>
                <div class="text-text-muted text-xs mt-0.5">Where new terminals open</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none"
                value={$settings.defaultTerminalDock}
                onchange={(e) => updateSetting("defaultTerminalDock", e.currentTarget.value as AppSettings["defaultTerminalDock"])}
              >
                <option value="bottom">Bottom</option>
                <option value="right">Right</option>
                <option value="tab">Tab</option>
                <option value="left">Left</option>
              </select>
            </div>

            <!-- Default shell -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Default shell</div>
                <div class="text-text-muted text-xs mt-0.5">Shell used for new terminals</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none"
                value={$settings.defaultShell}
                onchange={(e) => updateSetting("defaultShell", e.currentTarget.value as AppSettings["defaultShell"])}
              >
                <option value="auto">Auto</option>
                <option value="powershell">PowerShell</option>
                <option value="bash">Bash</option>
                <option value="cmd">CMD</option>
              </select>
            </div>

            <!-- Terminal font size -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Font size</div>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={$settings.terminalFontSize}
                  oninput={(e) => updateSetting("terminalFontSize", Number(e.currentTarget.value))}
                  class="w-28 accent-[var(--color-accent)]"
                />
                <span class="text-xs text-text-primary bg-bg-secondary px-2 py-0.5 rounded-md min-w-[2rem] text-center">{$settings.terminalFontSize}</span>
              </div>
            </div>

            <!-- Cursor style -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Cursor style</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none"
                value={$settings.terminalCursorStyle}
                onchange={(e) => updateSetting("terminalCursorStyle", e.currentTarget.value as AppSettings["terminalCursorStyle"])}
              >
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </select>
            </div>

          {:else if activeCategory === "Editor"}
            <!-- Editor font size -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Font size</div>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={$settings.editorFontSize}
                  oninput={(e) => updateSetting("editorFontSize", Number(e.currentTarget.value))}
                  class="w-28 accent-[var(--color-accent)]"
                />
                <span class="text-xs text-text-primary bg-bg-secondary px-2 py-0.5 rounded-md min-w-[2rem] text-center">{$settings.editorFontSize}</span>
              </div>
            </div>

            <!-- Tab size -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Tab size</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none"
                value={$settings.tabSize}
                onchange={(e) => updateSetting("tabSize", Number(e.currentTarget.value))}
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </div>

            <!-- Word wrap -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Word wrap</div>
                <div class="text-text-muted text-xs mt-0.5">Wrap long lines in the editor</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[44px] h-[24px] rounded-full relative cursor-pointer transition-colors {$settings.wordWrap ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("wordWrap", !$settings.wordWrap)}
              >
                <div
                  class="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform {$settings.wordWrap ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>

            <!-- Auto-save delay -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Auto-save delay</div>
                <div class="text-text-muted text-xs mt-0.5">Delay before auto-saving changes</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none"
                value={$settings.autoSaveDelay}
                onchange={(e) => updateSetting("autoSaveDelay", Number(e.currentTarget.value))}
              >
                <option value={0}>Off</option>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
              </select>
            </div>

          {:else if activeCategory === "Appearance"}
            <!-- UI Zoom -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">UI Zoom</div>
                <div class="text-text-muted text-xs mt-0.5">Scale the entire interface</div>
              </div>
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min="60"
                  max="200"
                  step="5"
                  value={Math.round($uiZoom * 100)}
                  oninput={(e) => {
                    const pct = Number(e.currentTarget.value);
                    const level = pct / 100;
                    uiZoom.set(level);
                    applyZoom(level);
                  }}
                  class="w-28 accent-[var(--color-accent)]"
                />
                <span class="text-xs text-text-primary bg-bg-secondary px-2 py-0.5 rounded-md min-w-[2.5rem] text-center">{Math.round($uiZoom * 100)}%</span>
              </div>
            </div>

            <!-- Theme -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Theme</div>
                <div class="text-text-muted text-xs mt-0.5">More themes coming soon</div>
              </div>
              <select
                class="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm outline-none opacity-60 cursor-not-allowed"
                value={$settings.theme}
                disabled
              >
                <option value="catppuccin-mocha">Catppuccin Mocha</option>
              </select>
            </div>

          {:else if activeCategory === "File Explorer"}
            <!-- Show hidden files -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Show hidden files</div>
                <div class="text-text-muted text-xs mt-0.5">Display files starting with a dot</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[44px] h-[24px] rounded-full relative cursor-pointer transition-colors {$settings.showHiddenFiles ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("showHiddenFiles", !$settings.showHiddenFiles)}
              >
                <div
                  class="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform {$settings.showHiddenFiles ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>

          {:else if activeCategory === "General"}
            <!-- Restore session -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Restore session on startup</div>
                <div class="text-text-muted text-xs mt-0.5">Re-open previous tabs and terminals</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[44px] h-[24px] rounded-full relative cursor-pointer transition-colors {$settings.restoreSession ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("restoreSession", !$settings.restoreSession)}
              >
                <div
                  class="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform {$settings.restoreSession ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>

            <!-- Confirm close unsaved -->
            <div class="flex justify-between items-center py-3 border-b border-border/50">
              <div>
                <div class="text-text-primary text-sm">Confirm before closing unsaved tabs</div>
                <div class="text-text-muted text-xs mt-0.5">Show a warning when closing tabs with unsaved changes</div>
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="w-[44px] h-[24px] rounded-full relative cursor-pointer transition-colors {$settings.confirmCloseUnsaved ? 'bg-accent' : 'bg-bg-active'}"
                onclick={() => updateSetting("confirmCloseUnsaved", !$settings.confirmCloseUnsaved)}
              >
                <div
                  class="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform {$settings.confirmCloseUnsaved ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                ></div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-5 px-6 py-2.5 border-t border-border text-xs text-text-muted">
        <span><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}
