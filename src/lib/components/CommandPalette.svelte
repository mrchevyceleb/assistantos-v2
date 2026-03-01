<script lang="ts">
  import { onMount, tick } from "svelte";
  import { workspacePath } from "$lib/stores/workspace";
  import { openTab, updateTabContent, setTabLoading } from "$lib/stores/tabs";
  import { listAllFiles, readFileText } from "$lib/utils/tauri";
  import { getFileColor } from "$lib/utils/file-types";
  import { settings } from "$lib/stores/settings";
  import type { FileEntry } from "$lib/utils/tauri";

  interface Props {
    visible: boolean;
    onClose: () => void;
  }

  let { visible, onClose }: Props = $props();
  let query = $state("");
  let allFiles = $state<FileEntry[]>([]);
  let filteredFiles = $state<FileEntry[]>([]);
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let isLoading = $state(false);

  // Load all files when palette opens
  $effect(() => {
    if (visible && $workspacePath) {
      isLoading = true;
      listAllFiles($workspacePath, $settings.showHiddenFiles).then((files) => {
        allFiles = files;
        filterFiles();
        isLoading = false;
        tick().then(() => inputEl?.focus());
      });
    }
    if (visible) {
      query = "";
      selectedIndex = 0;
      tick().then(() => inputEl?.focus());
    }
  });

  function filterFiles() {
    if (!query.trim()) {
      // Show recent/all files (limit to 50 for performance)
      filteredFiles = allFiles.slice(0, 50);
      return;
    }

    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);

    // Score-based fuzzy matching
    const scored = allFiles
      .map((file) => {
        const name = file.name.toLowerCase();
        const relPath = file.relative_path.toLowerCase();
        let score = 0;

        for (const term of terms) {
          // Exact name match
          if (name === term) score += 100;
          // Name starts with term
          else if (name.startsWith(term)) score += 50;
          // Name contains term
          else if (name.includes(term)) score += 30;
          // Path contains term
          else if (relPath.includes(term)) score += 10;
          // No match for this term
          else return { file, score: -1 };
        }

        return { file, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    filteredFiles = scored.map((r) => r.file);
    selectedIndex = 0;
  }

  $effect(() => {
    query; // track
    filterFiles();
  });

  async function openFile(file: FileEntry) {
    const tabId = openTab(file.path, file.name, file.ext);
    onClose();

    // Check if it's a text-viewable file
    const textExts = new Set([
      "md", "markdown", "mdx", "txt", "log", "csv", "tsv",
      "ts", "tsx", "js", "jsx", "mjs", "cjs",
      "py", "rs", "go", "rb", "java", "kt", "swift", "c", "cpp", "h",
      "sql", "graphql", "gql",
      "css", "scss", "less", "sass",
      "json", "jsonc", "yaml", "yml", "toml", "xml",
      "sh", "bash", "zsh", "ps1", "bat", "cmd",
      "html", "htm", "svelte", "vue", "astro",
      "env", "gitignore", "gitattributes",
    ]);

    if (!file.ext || textExts.has(file.ext.toLowerCase())) {
      try {
        const content = await readFileText(file.path);
        updateTabContent(tabId, content);
      } catch (e) {
        console.error("Failed to read file:", e);
        setTabLoading(tabId, false);
      }
    } else {
      // For images, videos, PDFs — just mark as loaded (viewer handles it)
      setTabLoading(tabId, false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredFiles.length - 1);
      scrollToSelected();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollToSelected();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        openFile(filteredFiles[selectedIndex]);
      }
    }
  }

  function scrollToSelected() {
    const el = document.querySelector(`[data-palette-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  function getEntryColor(ext?: string): string {
    return getFileColor("file", false, ext);
  }

  function highlightMatch(text: string, q: string): string {
    if (!q.trim()) return text;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let result = text;
    for (const term of terms) {
      const idx = result.toLowerCase().indexOf(term);
      if (idx !== -1) {
        result =
          result.slice(0, idx) +
          `<mark class="bg-accent/30 text-text-primary rounded-sm px-0.5">${result.slice(idx, idx + term.length)}</mark>` +
          result.slice(idx + term.length);
      }
    }
    return result;
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="w-[640px] max-h-[60vh] glass-panel-solid border border-border rounded-xl shadow-2xl glow-border flex flex-col overflow-hidden">
      <!-- Search input -->
      <div class="flex items-center gap-3 px-5 py-4 border-b border-border">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Type to search files..."
          class="flex-1 bg-transparent text-text-primary text-base outline-none placeholder-text-muted"
          type="text"
        />
        {#if isLoading}
          <span class="text-xs text-text-muted">Loading...</span>
        {:else}
          <span class="text-xs text-text-muted">{filteredFiles.length} files</span>
        {/if}
      </div>

      <!-- Results -->
      <div class="flex-1 overflow-y-auto py-1.5" role="listbox" aria-label="Command palette results">
        {#if filteredFiles.length === 0 && !isLoading}
          <div class="px-5 py-10 text-center text-text-muted text-base">
            {query ? "No files matching your search" : "No files found"}
          </div>
        {/if}

        {#each filteredFiles as file, i (file.path)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="flex items-center gap-3 px-5 py-2 cursor-pointer transition-colors"
            class:bg-bg-hover={i === selectedIndex}
            onclick={() => openFile(file)}
            onmouseenter={() => selectedIndex = i}
            data-palette-index={i}
            role="option"
            aria-selected={i === selectedIndex}
            tabindex={i === selectedIndex ? 0 : -1}
          >
            <!-- File icon dot -->
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style:background={getEntryColor(file.ext)}></span>

            <!-- File name + path -->
            <div class="flex-1 min-w-0">
              <div class="text-[14px] text-text-primary truncate">
                {@html highlightMatch(file.name, query)}
              </div>
              <div class="text-xs text-text-muted truncate">
                {@html highlightMatch(file.relative_path, query)}
              </div>
            </div>

            <!-- Extension badge -->
            {#if file.ext}
              <span class="text-xs text-text-muted px-2 py-0.5 rounded-md bg-bg-secondary shrink-0">
                .{file.ext}
              </span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-5 px-5 py-2.5 border-t border-border text-xs text-text-muted">
        <span><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">↑↓</kbd> Navigate</span>
        <span><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Enter</kbd> Open</span>
        <span><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Esc</kbd> Close</span>
      </div>
    </div>
  </div>
{/if}
