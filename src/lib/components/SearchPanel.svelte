<script lang="ts">
  import { workspacePath } from "$lib/stores/workspace";
  import { openTab, updateTabContent, setTabLoading } from "$lib/stores/tabs";
  import { searchFiles, readFileText } from "$lib/utils/tauri";
  import type { SearchResult } from "$lib/utils/tauri";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let query = $state("");
  let caseSensitive = $state(false);
  let results = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let hasSearched = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchInputEl: HTMLInputElement | undefined = $state();

  // Group results by file path
  let groupedResults = $derived.by(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const existing = groups.get(r.path);
      if (existing) {
        existing.push(r);
      } else {
        groups.set(r.path, [r]);
      }
    }
    return groups;
  });

  let fileCount = $derived(groupedResults.size);

  // Compute relative path from workspace root
  function relativePath(fullPath: string): string {
    const root = $workspacePath;
    if (!root) return fullPath;
    // Normalize separators for comparison
    const normalized = fullPath.replace(/\\/g, "/");
    const normalizedRoot = root.replace(/\\/g, "/");
    if (normalized.startsWith(normalizedRoot)) {
      return normalized.slice(normalizedRoot.length).replace(/^\//, "");
    }
    return fullPath;
  }

  // Extract filename from path
  function fileName(fullPath: string): string {
    const rel = relativePath(fullPath);
    const parts = rel.split("/");
    return parts[parts.length - 1];
  }

  // Extract extension from path
  function fileExt(fullPath: string): string | undefined {
    const name = fileName(fullPath);
    const dot = name.lastIndexOf(".");
    if (dot > 0) return name.slice(dot + 1);
    return undefined;
  }

  async function doSearch() {
    const root = $workspacePath;
    const q = query.trim();
    if (!root || !q) {
      results = [];
      hasSearched = false;
      return;
    }

    isSearching = true;
    hasSearched = true;
    try {
      results = await searchFiles(root, q, caseSensitive);
    } catch (e) {
      console.error("Search failed:", e);
      results = [];
    } finally {
      isSearching = false;
    }
  }

  function handleInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      doSearch();
    }, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (query) {
        query = "";
        results = [];
        hasSearched = false;
      } else {
        onClose();
      }
    }
    if (e.key === "Enter") {
      if (debounceTimer) clearTimeout(debounceTimer);
      doSearch();
    }
  }

  function toggleCase() {
    caseSensitive = !caseSensitive;
    if (query.trim()) {
      if (debounceTimer) clearTimeout(debounceTimer);
      doSearch();
    }
  }

  function clearSearch() {
    query = "";
    results = [];
    hasSearched = false;
    searchInputEl?.focus();
  }

  async function openResult(result: SearchResult) {
    const name = fileName(result.path);
    const ext = fileExt(result.path);
    const tabId = openTab(result.path, name, ext);
    try {
      const content = await readFileText(result.path);
      updateTabContent(tabId, content);
    } catch (e) {
      console.error("Failed to read file:", e);
      setTabLoading(tabId, false);
    }
  }

  // Highlight matching text in line content
  function highlightMatch(lineContent: string, q: string): string {
    if (!q) return escapeHtml(lineContent);
    const escaped = escapeRegex(q);
    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(escaped, flags);
    return lineContent.replace(regex, (match) => {
      return `<mark class="bg-accent/30 text-accent rounded-sm px-0.5">${escapeHtml(match)}</mark>`;
    });
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Auto-focus the search input on mount
  $effect(() => {
    searchInputEl?.focus();
  });

  // Re-search when case sensitivity changes (handled in toggleCase)
</script>

<div class="flex flex-col h-full bg-bg-secondary">
  <!-- Search header -->
  <div class="px-2 py-2 border-b border-border">
    <div class="flex items-center gap-1">
      <span class="text-[11px] font-semibold text-text-secondary uppercase tracking-wide flex-1">Search</span>
      <button
        onclick={onClose}
        class="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-bg-hover shrink-0"
        title="Close search (back to Explorer)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Search input row -->
    <div class="mt-1.5 flex items-center gap-1">
      <div class="relative flex-1">
        <input
          bind:this={searchInputEl}
          bind:value={query}
          oninput={handleInput}
          onkeydown={handleKeydown}
          type="text"
          placeholder="Search in files..."
          class="w-full bg-bg-primary text-text-primary text-xs px-2 py-1.5 pr-7 rounded border border-border
                 focus:border-accent focus:outline-none placeholder-text-muted"
        />
        {#if query}
          <button
            onclick={clearSearch}
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            title="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>

      <!-- Case sensitivity toggle -->
      <button
        onclick={toggleCase}
        class="shrink-0 text-[11px] font-bold px-1.5 py-1.5 rounded border transition-colors {caseSensitive ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-muted hover:text-text-primary hover:border-text-muted'}"
        title="Match Case"
      >
        Aa
      </button>
    </div>

    <!-- Result count -->
    {#if hasSearched && !isSearching}
      <div class="mt-1.5 text-[11px] text-text-muted">
        {results.length} result{results.length !== 1 ? "s" : ""} in {fileCount} file{fileCount !== 1 ? "s" : ""}
        {#if results.length >= 500}
          <span class="text-yellow-500">(limited to 500)</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Results area -->
  <div class="flex-1 overflow-y-auto overflow-x-hidden">
    {#if isSearching}
      <div class="flex items-center justify-center h-32 text-text-muted text-sm">
        <svg class="animate-spin mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Searching...
      </div>
    {:else if hasSearched && results.length === 0}
      <div class="flex flex-col items-center justify-center h-32 text-text-muted text-sm gap-1">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>No results found</span>
      </div>
    {:else if results.length > 0}
      <div class="py-1">
        {#each [...groupedResults.entries()] as [filePath, fileResults] (filePath)}
          <!-- File group -->
          <div class="mb-0.5">
            <!-- File header -->
            <button
              class="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-bg-hover transition-colors group"
              onclick={() => openResult(fileResults[0])}
              title={relativePath(filePath)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-text-muted">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="text-xs text-text-primary truncate">{fileName(filePath)}</span>
              <span class="text-[10px] text-text-muted truncate flex-1 min-w-0">{relativePath(filePath)}</span>
              <span class="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded-full shrink-0">
                {fileResults.length}
              </span>
            </button>

            <!-- Match lines -->
            {#each fileResults as result (result.path + ':' + result.line_number)}
              <button
                class="w-full flex items-start gap-2 pl-6 pr-2 py-0.5 text-left hover:bg-bg-hover transition-colors cursor-pointer"
                onclick={() => openResult(result)}
              >
                <span class="text-[10px] text-text-muted tabular-nums shrink-0 mt-px w-5 text-right">
                  {result.line_number}
                </span>
                <span class="text-xs text-text-secondary truncate min-w-0 leading-relaxed">
                  {@html highlightMatch(result.line_content.trim(), query.trim())}
                </span>
              </button>
            {/each}
          </div>
        {/each}
      </div>
    {:else if !hasSearched}
      <div class="flex flex-col items-center justify-center h-32 text-text-muted gap-2 px-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="text-xs text-center">
          Type to search across all files in the workspace
        </span>
        <span class="text-[10px] text-text-muted">
          Press <kbd class="px-1 py-0.5 bg-bg-primary rounded border border-border">Enter</kbd> to search immediately
        </span>
      </div>
    {/if}
  </div>
</div>
