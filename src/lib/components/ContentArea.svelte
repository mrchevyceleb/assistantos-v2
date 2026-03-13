<script lang="ts">
  import { activeTab, tabs, activeTabId, toggleEditMode, updateTabContent, setTabModified } from "$lib/stores/tabs";
  import { addChat } from "$lib/stores/chat-instances";
  import { writeFileText, createFile, readDirectoryTree } from "$lib/utils/tauri";
  import { settings } from "$lib/stores/settings";
  import { workspacePath, fileTree, workspaceName } from "$lib/stores/workspace";
  import { addTerminal } from "$lib/stores/terminal";
  import MarkdownViewer from "./MarkdownViewer.svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import CodeViewer from "./CodeViewer.svelte";
  import HtmlViewer from "./HtmlViewer.svelte";
  import ImageViewer from "./ImageViewer.svelte";
  import VideoPlayer from "./VideoPlayer.svelte";
  import PdfViewer from "./PdfViewer.svelte";
  import TerminalTab from "./TerminalTab.svelte";
  import ChatPanel from "./chat/ChatPanel.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Context menu state for empty area
  let contextMenu = $state<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });

  function handleEmptyAreaContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { visible: true, x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenu = { visible: false, x: 0, y: 0 };
  }

  function joinPath(...parts: string[]): string {
    const sep = parts[0]?.includes("\\") ? "\\" : "/";
    return parts.join(sep);
  }

  async function refreshTree() {
    const path = $workspacePath;
    if (!path) return;
    try {
      const tree = await readDirectoryTree(path, $settings.showHiddenFiles);
      fileTree.set(tree);
      workspaceName.set(tree.name);
    } catch (e) {
      console.error("Failed to refresh tree:", e);
    }
  }

  function getEmptyAreaMenuItems(): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: "New Terminal",
        shortcut: "Ctrl+`",
        action: () => {
          const cwd = $workspacePath || "";
          addTerminal(cwd, $settings.defaultTerminalDock);
        },
      },
      {
        label: "New Chat",
        action: () => {
          addChat($settings.aiModel, $settings.aiProvider, $settings.aiChatDock);
        },
      },
    ];

    if ($workspacePath) {
      items.push(
        { label: "", separator: true, action: () => {} },
        {
          label: "New File",
          action: async () => {
            const name = window.prompt("New file name:");
            if (!name) return;
            try {
              const fullPath = joinPath($workspacePath!, name);
              await createFile(fullPath, false);
              await refreshTree();
            } catch (e) {
              console.error("Failed to create file:", e);
            }
          },
        },
        {
          label: "New Folder",
          action: async () => {
            const name = window.prompt("New folder name:");
            if (!name) return;
            try {
              const fullPath = joinPath($workspacePath!, name);
              await createFile(fullPath, true);
              await refreshTree();
            } catch (e) {
              console.error("Failed to create folder:", e);
            }
          },
        },
      );
    }

    return items;
  }

  // Derived: all terminal tabs that need to stay mounted
  let terminalTabs = $derived($tabs.filter((t) => t.viewerType === "terminal"));
  let chatTabs = $derived($tabs.filter((t) => t.viewerType === "chat"));
  // Is the active tab a terminal?
  let activeIsSpecial = $derived($activeTab?.viewerType === "terminal" || $activeTab?.viewerType === "chat");

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

    // Auto-save after configured delay (0 = disabled)
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if ($settings.autoSaveDelay > 0) {
      autoSaveTimer = setTimeout(() => handleSave(content), $settings.autoSaveDelay);
    }
  }

  function handleToggleEdit() {
    if ($activeTab) {
      toggleEditMode($activeTab.id);
    }
  }

  // Keyboard shortcut: Ctrl+E to toggle edit
  function handleKeydown(e: KeyboardEvent) {
    const isMod = navigator.userAgent.includes("Mac") ? e.metaKey : e.ctrlKey;
    if (isMod && e.key === "e") {
      e.preventDefault();
      handleToggleEdit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full flex flex-col relative">
  <!-- Terminal tabs: always mounted, shown/hidden via CSS to preserve PTY sessions -->
  {#each terminalTabs as ttab (ttab.id)}
    <div
      class="absolute inset-0"
      class:hidden={$activeTabId !== ttab.id}
    >
      <TerminalTab terminalId={ttab.path.replace("__terminal__:", "")} />
    </div>
  {/each}

  {#each chatTabs as ctab (ctab.id)}
    <div
      class="absolute inset-0 p-1.5"
      class:hidden={$activeTabId !== ctab.id}
    >
      <ChatPanel instanceId={ctab.path.replace("__chat__:", "").replace("__chat__", "legacy")} />
    </div>
  {/each}

  <!-- Non-terminal content: standard {#if} rendering -->
  {#if $activeTab && !activeIsSpecial}
    {#if $activeTab.isLoading}
      <div class="flex-1 flex items-center justify-center text-text-muted">
        <span class="text-sm">Loading...</span>
      </div>
    {:else}
      <!-- Edit/Preview toolbar for text content -->
      {#if $activeTab.viewerType === "markdown" || $activeTab.viewerType === "html" || $activeTab.viewerType === "code" || $activeTab.viewerType === "text"}
        <div class="flex items-center gap-3.5 px-6 py-3 glass-panel-solid border-b border-border panel-lift">
          <button
            class="text-[13px] px-4.5 py-2 rounded-md transition-colors"
            class:bg-accent={!$activeTab.editMode}
            class:text-bg-primary={!$activeTab.editMode}
            class:text-text-muted={$activeTab.editMode}
            class:hover:text-text-primary={$activeTab.editMode}
            onclick={() => { if ($activeTab?.editMode) handleToggleEdit(); }}
          >
            Preview
          </button>
          <button
            class="text-[13px] px-4.5 py-2 rounded-md transition-colors"
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
            language={
              $activeTab.viewerType === "markdown"
                ? "markdown"
                : $activeTab.viewerType === "html"
                  ? "html"
                  : ($activeTab.ext || "text")
            }
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
  {:else if !$activeTab}
    <!-- Empty state -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex-1 flex items-center justify-center text-text-muted"
      oncontextmenu={handleEmptyAreaContextMenu}
    >
      <div class="text-center">
        <h2 class="text-3xl font-light mb-3 text-text-secondary" style="text-shadow: 0 0 30px rgba(88, 180, 208, 0.15);">AssistantOS</h2>
        <p class="text-base">Open a file from the sidebar to get started</p>
        <p class="text-sm text-text-muted mt-1">Right-click for quick actions</p>
        <div class="mt-8 text-sm space-y-2.5">
          <p><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Ctrl+O</kbd> Open Folder</p>
          <p><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Ctrl+P</kbd> Quick Open</p>
          <p><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Ctrl+`</kbd> New Terminal</p>
          <p><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Ctrl+E</kbd> Toggle Edit</p>
          <p><kbd class="px-2 py-1 bg-bg-secondary rounded-md border border-border text-text-secondary">Ctrl++/-</kbd> Zoom In/Out</p>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Empty area context menu -->
{#if contextMenu.visible}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={getEmptyAreaMenuItems()}
    onClose={closeContextMenu}
  />
{/if}
