<script lang="ts">
  import { settings, updateSetting, settingsVisible, aiSettingsVisible } from "$lib/stores/settings";
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

  const categoryDescriptions: Record<Category, string> = {
    Terminal: "Shell, font, and cursor preferences",
    Editor: "Code editing behavior and formatting",
    Appearance: "Theme and display scaling",
    "File Explorer": "File browser visibility options",
    General: "Startup and session behavior",
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  function openAISettings() {
    onClose();
    aiSettingsVisible.set(true);
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="settings-modal fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="settings-panel w-[1080px] max-h-[90vh] min-h-[620px] glass-panel-solid border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-8 py-5 border-b border-border/40">
        <h2 class="text-text-primary text-lg font-semibold tracking-wide">Settings</h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          onclick={onClose}
          aria-label="Close settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Body: sidebar + content -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left sidebar -->
        <div class="w-[280px] border-r border-border/40 py-5 shrink-0 flex flex-col gap-1.5">
          {#each categories as cat}
            <button
              class="flex items-center gap-3.5 mx-3 px-4 py-3.5 text-left rounded-lg transition-all
                {activeCategory === cat
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-primary'}"
              style="font-size: calc(16.5px * var(--ui-zoom));"
              onclick={() => activeCategory = cat}
            >
              <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                <path d={categoryIcons[cat]}/>
              </svg>
              {cat}
            </button>
          {/each}

          <!-- AI & Models redirect -->
          <div class="border-t border-border/20" style="margin-top: 8px; padding-top: 8px;">
            <button
              class="flex items-center gap-3.5 mx-3 px-4 py-3.5 text-left rounded-lg transition-all text-text-muted hover:bg-bg-hover/60 hover:text-text-primary"
              style="font-size: calc(16.5px * var(--ui-zoom));"
              onclick={openAISettings}
            >
              <svg width="22" height="22" style="width: calc(22px * var(--ui-zoom)); height: calc(22px * var(--ui-zoom));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
              </svg>
              AI & Models
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="shrink-0 opacity-50" style="margin-left: auto;">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Right content -->
        <div class="flex-1 overflow-y-auto px-10 py-8">
          <!-- Section header -->
          <div class="mb-8">
            <h3 class="text-text-primary text-[16px] font-semibold">{activeCategory}</h3>
            <p class="text-text-muted text-[13px] mt-1.5">{categoryDescriptions[activeCategory]}</p>
          </div>

          {#if activeCategory === "Terminal"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Default dock position -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Default dock position</div>
                  <div class="text-text-muted text-[12px] mt-1">Where new terminals open</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
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
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Default shell</div>
                  <div class="text-text-muted text-[12px] mt-1">Shell used for new terminals</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
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
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.terminalFontSize}
                    oninput={(e) => updateSetting("terminalFontSize", Number(e.currentTarget.value))}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[2.5rem] text-center font-mono">{$settings.terminalFontSize}</span>
                </div>
              </div>

              <!-- Cursor style -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Cursor style</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.terminalCursorStyle}
                  onchange={(e) => updateSetting("terminalCursorStyle", e.currentTarget.value as AppSettings["terminalCursorStyle"])}
                >
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                  <option value="bar">Bar</option>
                </select>
              </div>

              <!-- Terminal style -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Terminal style</div>
                  <div class="text-text-muted text-[12px] mt-1">Visual preset for terminal panels</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.terminalStylePreset}
                  onchange={(e) => updateSetting("terminalStylePreset", e.currentTarget.value as AppSettings["terminalStylePreset"])}
                >
                  <option value="metal">Brushed Metal</option>
                  <option value="minimal">Minimal</option>
                  <option value="retro">Retro</option>
                  <option value="high-contrast">High Contrast</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "Editor"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Editor font size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.editorFontSize}
                    oninput={(e) => updateSetting("editorFontSize", Number(e.currentTarget.value))}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[2.5rem] text-center font-mono">{$settings.editorFontSize}</span>
                </div>
              </div>

              <!-- Tab size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Tab size</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.tabSize}
                  onchange={(e) => updateSetting("tabSize", Number(e.currentTarget.value))}
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </div>

              <!-- Word wrap -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Word wrap</div>
                  <div class="text-text-muted text-[12px] mt-1">Wrap long lines in the editor</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.wordWrap ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("wordWrap", !$settings.wordWrap)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.wordWrap ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>

              <!-- Auto-save delay -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Auto-save delay</div>
                  <div class="text-text-muted text-[12px] mt-1">Delay before auto-saving changes</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
                  value={$settings.autoSaveDelay}
                  onchange={(e) => updateSetting("autoSaveDelay", Number(e.currentTarget.value))}
                >
                  <option value={0}>Off</option>
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "Appearance"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- UI Zoom -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">UI Zoom</div>
                  <div class="text-text-muted text-[12px] mt-1">Scale the entire interface</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="240"
                    step="5"
                    value={Math.round($uiZoom * 100)}
                    oninput={(e) => {
                      const pct = Number(e.currentTarget.value);
                      const level = pct / 100;
                      uiZoom.set(level);
                      applyZoom(level);
                    }}
                    class="w-32 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[3rem] text-center font-mono">{Math.round($uiZoom * 100)}%</span>
                </div>
              </div>

              <!-- Theme -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Theme</div>
                  <div class="text-text-muted text-[12px] mt-1">More themes coming soon</div>
                </div>
                <select
                  class="bg-bg-primary border border-border/40 rounded-lg px-4 py-2 text-text-primary text-[13.5px] outline-none opacity-50 cursor-not-allowed"
                  value={$settings.theme}
                  disabled
                >
                  <option value="catppuccin-mocha">Liquid Metal</option>
                </select>
              </div>
            </div>

          {:else if activeCategory === "File Explorer"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- File tree font size -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Font size</div>
                  <div class="text-text-muted text-[12px] mt-1">File tree text size in pixels</div>
                </div>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="24"
                    step="1"
                    value={$settings.fileTreeFontSize}
                    oninput={(e) => updateSetting("fileTreeFontSize", Number(e.currentTarget.value))}
                    class="w-24 accent-[var(--color-accent)]"
                  />
                  <span class="text-[13px] text-text-primary bg-bg-primary px-2.5 py-1 rounded-md border border-border/30 min-w-[3rem] text-center font-mono">{$settings.fileTreeFontSize}px</span>
                </div>
              </div>

              <!-- Show hidden files -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Show hidden files</div>
                  <div class="text-text-muted text-[12px] mt-1">Display files starting with a dot</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.showHiddenFiles ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("showHiddenFiles", !$settings.showHiddenFiles)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.showHiddenFiles ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
            </div>

          {:else if activeCategory === "General"}
            <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
              <!-- Restore session -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Restore session on startup</div>
                  <div class="text-text-muted text-[12px] mt-1">Re-open previous tabs and terminals</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.restoreSession ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("restoreSession", !$settings.restoreSession)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.restoreSession ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>

              <!-- Confirm close unsaved -->
              <div class="flex justify-between items-center py-6 px-7">
                <div>
                  <div class="text-text-primary text-[13.5px]">Confirm before closing unsaved tabs</div>
                  <div class="text-text-muted text-[12px] mt-1">Show a warning when closing tabs with unsaved changes</div>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="w-[46px] h-[26px] rounded-full relative cursor-pointer transition-colors {$settings.confirmCloseUnsaved ? 'bg-accent' : 'bg-bg-active'}"
                  onclick={() => updateSetting("confirmCloseUnsaved", !$settings.confirmCloseUnsaved)}
                >
                  <div
                    class="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform {$settings.confirmCloseUnsaved ? 'translate-x-[22px]' : 'translate-x-[2px]'}"
                  ></div>
                </div>
              </div>
            </div>

          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-5 px-8 py-4 border-t border-border/40 text-[13px] text-text-muted">
        <span><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border/40 text-text-secondary text-[12px]">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-panel {
    font-size: calc(16px * var(--ui-zoom));
  }

  .settings-panel :global(h2) {
    font-size: calc(26px * var(--ui-zoom));
    letter-spacing: 0.01em;
  }

  .settings-panel :global(h3) {
    font-size: calc(24px * var(--ui-zoom));
    letter-spacing: 0.01em;
  }

  .settings-panel :global(input),
  .settings-panel :global(select),
  .settings-panel :global(textarea),
  .settings-panel :global(button) {
    font-size: calc(15px * var(--ui-zoom));
  }

  /* ── Spacing overrides (Tailwind 4 JIT doesn't generate these) ── */
  .settings-panel :global(.py-6) {
    padding-top: 1.9rem;
    padding-bottom: 1.9rem;
  }

  .settings-panel :global(.px-7) {
    padding-left: 2.15rem;
    padding-right: 2.15rem;
  }

  .settings-panel :global(.px-8) {
    padding-left: 2.35rem;
    padding-right: 2.35rem;
  }

  .settings-panel :global(.py-5) {
    padding-top: 1.55rem;
    padding-bottom: 1.55rem;
  }

  .settings-panel :global(.px-10) {
    padding-left: 2.5rem;
    padding-right: 2.5rem;
  }

  .settings-panel :global(.py-8) {
    padding-top: 2rem;
    padding-bottom: 2rem;
  }

  .settings-panel :global(.py-4) {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .settings-panel :global(.px-4) {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .settings-panel :global(.py-2) {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .settings-panel :global(.px-2) {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .settings-panel :global(.py-1) {
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
  }

  .settings-panel :global(.py-3) {
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
  }

  .settings-panel :global(.mx-3) {
    margin-left: 0.75rem;
    margin-right: 0.75rem;
  }

  .settings-panel :global(.mb-8) {
    margin-bottom: 2rem;
  }

  .settings-panel :global(.mb-3) {
    margin-bottom: 0.75rem;
  }

  .settings-panel :global(.mt-1) {
    margin-top: 0.25rem;
  }

  .settings-panel :global(.mt-2) {
    margin-top: 0.5rem;
  }

  .settings-panel :global(.mt-4) {
    margin-top: 1rem;
  }

  .settings-panel :global(.mb-1) {
    margin-bottom: 0.25rem;
  }

  .settings-panel :global(.mb-2) {
    margin-bottom: 0.5rem;
  }

  .settings-panel :global(.mb-4) {
    margin-bottom: 1rem;
  }

  .settings-panel :global(.ml-1) {
    margin-left: 0.25rem;
  }

  .settings-panel :global(.px-1) {
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }

  .settings-panel :global(.px-3) {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .settings-panel :global(.pl-10) {
    padding-left: 2.5rem;
  }

  .settings-panel :global(.p-3) {
    padding: 0.75rem;
  }

  /* Fractional spacing classes */
  .settings-panel :global(.gap-1) {
    gap: 0.25rem;
  }

  .settings-panel :global(.gap-1\.5) {
    gap: 0.375rem;
  }

  .settings-panel :global(.gap-2) {
    gap: 0.5rem;
  }

  .settings-panel :global(.gap-3) {
    gap: 0.75rem;
  }

  .settings-panel :global(.gap-3\.5) {
    gap: 0.875rem;
  }

  .settings-panel :global(.gap-4) {
    gap: 1rem;
  }

  .settings-panel :global(.gap-5) {
    gap: 1.25rem;
  }

  .settings-panel :global(.py-1\.5) {
    padding-top: 0.375rem;
    padding-bottom: 0.375rem;
  }

  .settings-panel :global(.py-2\.5) {
    padding-top: 0.625rem;
    padding-bottom: 0.625rem;
  }

  .settings-panel :global(.py-3\.5) {
    padding-top: 0.875rem;
    padding-bottom: 0.875rem;
  }

  .settings-panel :global(.px-2\.5) {
    padding-left: 0.625rem;
    padding-right: 0.625rem;
  }

  .settings-panel :global(.p-2\.5) {
    padding: 0.625rem;
  }

  .settings-panel :global(.p-3\.5) {
    padding: 0.875rem;
  }

  .settings-panel :global(.mt-1\.5) {
    margin-top: 0.375rem;
  }

  .settings-panel :global(.mb-1\.5) {
    margin-bottom: 0.375rem;
  }

  .settings-panel :global(.pb-0\.5) {
    padding-bottom: 0.125rem;
  }

  .settings-panel :global(.pt-5) {
    padding-top: 1.25rem;
  }

  .settings-panel :global(.text-\[13\.5px\]),
  .settings-panel :global(.text-\[13px\]),
  .settings-panel :global(.text-\[12px\]),
  .settings-panel :global(.text-\[11px\]) {
    font-size: calc(15px * var(--ui-zoom));
    line-height: 1.45;
  }

  .settings-panel :global(.text-\[16px\]) {
    font-size: calc(20px * var(--ui-zoom));
  }
</style>
