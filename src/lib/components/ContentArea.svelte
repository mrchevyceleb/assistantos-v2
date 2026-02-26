<script lang="ts">
  import { activeTab, toggleEditMode, updateTabContent, setTabModified } from "$lib/stores/tabs";
  import { writeFileText } from "$lib/utils/tauri";
  import MarkdownViewer from "./MarkdownViewer.svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import CodeViewer from "./CodeViewer.svelte";
  import HtmlViewer from "./HtmlViewer.svelte";
  import ImageViewer from "./ImageViewer.svelte";
  import VideoPlayer from "./VideoPlayer.svelte";
  import PdfViewer from "./PdfViewer.svelte";

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleSave(content: string) {
    const tab = $activeTab;
    if (!tab) return;
    try {
      await writeFileText(tab.path, content);
      updateTabContent(tab.id, content);
      setTabModified(tab.id, false);
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }

  function handleChange(content: string) {
    const tab = $activeTab;
    if (!tab) return;
    updateTabContent(tab.id, content);
    setTabModified(tab.id, true);

    // Auto-save after 2 seconds
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => handleSave(content), 2000);
  }

  function handleToggleEdit() {
    if ($activeTab) {
      toggleEditMode($activeTab.id);
    }
  }

  // Keyboard shortcut: Ctrl+E to toggle edit
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === "e") {
      e.preventDefault();
      handleToggleEdit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full flex flex-col">
  {#if $activeTab}
    {#if $activeTab.isLoading}
      <div class="flex-1 flex items-center justify-center text-text-muted">
        <span class="text-sm">Loading...</span>
      </div>
    {:else}
      <!-- Edit/Preview toolbar for text content -->
      {#if $activeTab.viewerType === "markdown" || $activeTab.viewerType === "code" || $activeTab.viewerType === "text"}
        <div class="flex items-center gap-2 px-3 py-1 bg-bg-secondary border-b border-border">
          <button
            class="text-xs px-2 py-0.5 rounded transition-colors"
            class:bg-accent={!$activeTab.editMode}
            class:text-bg-primary={!$activeTab.editMode}
            class:text-text-muted={$activeTab.editMode}
            class:hover:text-text-primary={$activeTab.editMode}
            onclick={() => { if ($activeTab?.editMode) handleToggleEdit(); }}
          >
            Preview
          </button>
          <button
            class="text-xs px-2 py-0.5 rounded transition-colors"
            class:bg-accent={$activeTab.editMode}
            class:text-bg-primary={$activeTab.editMode}
            class:text-text-muted={!$activeTab.editMode}
            class:hover:text-text-primary={!$activeTab.editMode}
            onclick={() => { if (!$activeTab?.editMode) handleToggleEdit(); }}
          >
            Edit
          </button>
          <span class="text-xs text-text-muted ml-auto">Ctrl+E</span>
        </div>
      {/if}

      <!-- Content viewer -->
      <div class="flex-1 overflow-hidden">
        {#if $activeTab.editMode && $activeTab.content !== undefined}
          <CodeEditor
            content={$activeTab.content}
            onSave={handleSave}
            onChange={handleChange}
            language={$activeTab.viewerType === "markdown" ? "markdown" : $activeTab.ext}
          />
        {:else if $activeTab.viewerType === "markdown" && $activeTab.content !== undefined}
          <MarkdownViewer content={$activeTab.content} filePath={$activeTab.path} />
        {:else if $activeTab.viewerType === "html" && $activeTab.content !== undefined}
          <HtmlViewer content={$activeTab.content} filePath={$activeTab.path} />
        {:else if $activeTab.viewerType === "image"}
          <ImageViewer filePath={$activeTab.path} />
        {:else if $activeTab.viewerType === "video"}
          <VideoPlayer filePath={$activeTab.path} />
        {:else if $activeTab.viewerType === "pdf"}
          <PdfViewer filePath={$activeTab.path} />
        {:else if ($activeTab.viewerType === "code" || $activeTab.viewerType === "text") && $activeTab.content !== undefined}
          <CodeViewer content={$activeTab.content} ext={$activeTab.ext} />
        {:else}
          <div class="flex-1 flex items-center justify-center text-text-muted">
            <div class="text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4" class="mx-auto mb-3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p class="text-sm">Cannot preview this file type</p>
              <p class="text-xs mt-1">{$activeTab.ext ? `.${$activeTab.ext}` : "Unknown"}</p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- Empty state -->
    <div class="flex-1 flex items-center justify-center text-text-muted">
      <div class="text-center">
        <h2 class="text-2xl font-light mb-2 text-text-secondary">AssistantOS</h2>
        <p class="text-sm">Open a file from the sidebar to get started</p>
        <div class="mt-6 text-xs space-y-1">
          <p><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Ctrl+O</kbd> Open Folder</p>
          <p><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Ctrl+P</kbd> Quick Open</p>
          <p><kbd class="px-1.5 py-0.5 bg-bg-secondary rounded border border-border">Ctrl+E</kbd> Toggle Edit</p>
        </div>
      </div>
    </div>
  {/if}
</div>
