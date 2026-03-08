<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import FileTree from "$lib/components/FileTree.svelte";
  import SearchPanel from "$lib/components/SearchPanel.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import ContentArea from "$lib/components/ContentArea.svelte";
  import TerminalPanel from "$lib/components/TerminalPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import ResizeHandle from "$lib/components/ResizeHandle.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import IconRail from "$lib/components/IconRail.svelte";
  import { sidebarWidth, sidebarVisible, workspacePath } from "$lib/stores/workspace";
  import { terminalVisible, terminalHeight, rightPanelVisible, rightPanelWidth, bottomTerminals, addTerminal, leftPanelVisible, leftPanelWidth } from "$lib/stores/terminal";
  import { readDirectoryTree, readFileText, startWatcher, stopWatcher } from "$lib/utils/tauri";
  import { fileTree, workspaceName, isLoadingTree } from "$lib/stores/workspace";
  import { tabs, updateTabContent, reopenLastClosedTab, setTabLoading } from "$lib/stores/tabs";
  import { restoreState, startAutoSave, stopAutoSave, setSidebarViewRef } from "$lib/stores/persistence";
  import { initZoom } from "$lib/stores/ui";
  import { settingsVisible, aiSettingsVisible, settings, updateSetting } from "$lib/stores/settings";
  import ChatDockPanel from "$lib/components/chat/ChatDockPanel.svelte";
  import AISettingsPage from "$lib/components/ai-settings/AISettingsPage.svelte";
  import {
    chatInstances, chatVisible, chatPanelWidth, chatPanelHeight,
    rightChats, bottomChats, addChat,
  } from "$lib/stores/chat-instances";
  import UpdateNotification from "$lib/components/UpdateNotification.svelte";

  let paletteVisible = $state(false);
  let sidebarView = $state<"explorer" | "search">("explorer");

  // Keep persistence module in sync with local sidebarView state
  $effect(() => {
    setSidebarViewRef(sidebarView);
  });

  // ── File Watcher ────────────────────────────────────────────────────
  let unlistenFs: UnlistenFn | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Refresh tree + reload changed open tabs */
  async function handleFsChanges(changedPaths: string[]) {
    const wsPath = get(workspacePath);
    if (!wsPath) return;

    // Refresh file tree
    try {
      const tree = await readDirectoryTree(wsPath);
      fileTree.set(tree);
    } catch (e) {
      console.error("Failed to refresh file tree:", e);
    }

    // Reload content for open tabs whose files changed (skip unsaved tabs)
    const currentTabs = get(tabs);
    const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const changedSet = new Set(changedPaths.map(normalize));

    for (const tab of currentTabs) {
      if (tab.isModified) continue; // don't clobber unsaved edits
      if (!changedSet.has(normalize(tab.path))) continue;

      try {
        const content = await readFileText(tab.path);
        updateTabContent(tab.id, content);
      } catch {
        // file may have been deleted — ignore
      }
    }
  }

  async function setupWatcher(wsPath: string) {
    // Start backend watcher
    try {
      await startWatcher(wsPath);
    } catch (e) {
      console.error("Failed to start file watcher:", e);
    }

    // Listen for fs-change events from Rust
    unlistenFs = await listen<{ kind: string; paths: string[] }>("fs-change", (event) => {
      // Debounce: batch rapid changes into a single refresh
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleFsChanges(event.payload.paths);
      }, 500);
    });
  }

  async function teardownWatcher() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (unlistenFs) {
      unlistenFs();
      unlistenFs = null;
    }
    try {
      await stopWatcher();
    } catch {
      // ignore
    }
  }

  // React to workspace path changes
  const unsubWorkspace = workspacePath.subscribe((wsPath) => {
    // Tear down previous watcher, then set up new one if path exists
    teardownWatcher().then(() => {
      if (wsPath) {
        setupWatcher(wsPath);
      }
    });
  });

  onMount(() => {
    // Apply persisted zoom level
    initZoom();

    // Restore persisted state on startup
    restoreState().then(async (restoredSidebarView) => {
      if (restoredSidebarView) {
        sidebarView = restoredSidebarView;
      }

      // If a workspace path was restored, reload the file tree
      const wsPath = get(workspacePath);
      if (wsPath) {
        isLoadingTree.set(true);
        try {
          const tree = await readDirectoryTree(wsPath);
          fileTree.set(tree);
          workspaceName.set(tree.name);
        } catch (e) {
          console.error("Failed to restore workspace tree:", e);
          // Workspace path no longer valid — clear it
          workspacePath.set(null);
        } finally {
          isLoadingTree.set(false);
        }
      }

      // Start auto-saving after restore is complete
      startAutoSave();
    });

    return () => {
      // Cleanup on destroy
      stopAutoSave();
      unsubWorkspace();
      teardownWatcher();
    };
  });

  function handleSidebarResize(delta: number) {
    sidebarWidth.update((w) => Math.max(240, Math.min(720, w + delta)));
  }

  function handleTerminalResize(delta: number) {
    terminalHeight.update((h) => Math.max(100, Math.min(600, h - delta)));
  }

  function handleRightPanelResize(delta: number) {
    rightPanelWidth.update((w) => Math.max(200, Math.min(800, w - delta)));
  }

  function handleLeftPanelResize(delta: number) {
    leftPanelWidth.update((w) => Math.max(200, Math.min(800, w + delta)));
  }

  function handleChatRightResize(delta: number) {
    chatPanelWidth.update((w) => Math.max(340, Math.min(900, w - delta)));
  }

  function handleChatBottomResize(delta: number) {
    chatPanelHeight.update((h) => Math.max(180, Math.min(600, h - delta)));
  }

  let hasRightChats = $derived($rightChats.length > 0);
  let hasBottomChats = $derived($bottomChats.length > 0);

  // Global keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+,: Toggle settings modal
    if (e.ctrlKey && e.key === ",") {
      e.preventDefault();
      settingsVisible.update((v) => !v);
      return;
    }

    // Ctrl+Shift+F: Global search
    if (e.ctrlKey && e.shiftKey && e.key === "F") {
      e.preventDefault();
      sidebarVisible.set(true);
      sidebarView = "search";
      return;
    }

    // Ctrl+P: Command palette
    if (e.ctrlKey && e.key === "p") {
      e.preventDefault();
      paletteVisible = !paletteVisible;
      return;
    }

    // Ctrl+Shift+T: Reopen closed tab
    if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
      e.preventDefault();
      const tabId = reopenLastClosedTab();
      if (tabId) {
        const reopened = get(tabs).find((t) => t.id === tabId);
        if (reopened && reopened.isLoading && !reopened.path.startsWith("__terminal__:")) {
          readFileText(reopened.path)
            .then((content) => updateTabContent(tabId, content))
            .catch(() => setTabLoading(tabId, false));
        }
      }
      return;
    }

    // Ctrl+= / Ctrl++: Increase terminal + chat font size
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      updateSetting("terminalFontSize", Math.min(32, $settings.terminalFontSize + 1));
      updateSetting("aiChatFontSize", Math.min(32, $settings.aiChatFontSize + 1));
      return;
    }

    // Ctrl+-: Decrease terminal + chat font size
    if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      updateSetting("terminalFontSize", Math.max(8, $settings.terminalFontSize - 1));
      updateSetting("aiChatFontSize", Math.max(8, $settings.aiChatFontSize - 1));
      return;
    }

    // Ctrl+0: Reset terminal + chat font size
    if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      updateSetting("terminalFontSize", 14);
      updateSetting("aiChatFontSize", 15);
      return;
    }

    // Ctrl+O: Open folder
    if (e.ctrlKey && e.key === "o") {
      e.preventDefault();
      import("@tauri-apps/plugin-dialog").then(({ open }) => {
        open({ directory: true, multiple: false, title: "Open Folder" }).then((selected) => {
          if (selected && typeof selected === "string") {
            workspacePath.set(selected);
            isLoadingTree.set(true);
            readDirectoryTree(selected).then((tree) => {
              fileTree.set(tree);
              workspaceName.set(tree.name);
              isLoadingTree.set(false);
            });
          }
        });
      });
    }

    // Ctrl+L: Toggle AI Chat panel (create one if none exist)
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      const instances = get(chatInstances);
      const hasPanel = instances.some((c) => c.dock === 'right' || c.dock === 'bottom');
      if (hasPanel) {
        chatVisible.update((v) => !v);
      } else {
        addChat($settings.aiModel, $settings.aiProvider, $settings.aiChatDock === 'tab' ? 'right' : $settings.aiChatDock);
      }
      return;
    }

    // Ctrl+B: Toggle sidebar
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      sidebarVisible.update((v) => !v);
    }

    // Ctrl+`: Toggle terminal (spawn one if none exist)
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      if (get(bottomTerminals).length === 0) {
        addTerminal($workspacePath || "", $settings.defaultTerminalDock);
      } else {
        terminalVisible.update((v) => !v);
      }
    }

    // Ctrl+Shift+`: New terminal
    if (e.ctrlKey && e.shiftKey && e.key === "`") {
      e.preventDefault();
      addTerminal($workspacePath || "", $settings.defaultTerminalDock);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Command Palette -->
<CommandPalette visible={paletteVisible} onClose={() => paletteVisible = false} />

<div class="h-full flex flex-col">
  <!-- Custom title bar -->
  <TitleBar />

  <!-- Main content area -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Icon rail (always visible) -->
    <IconRail
      activeView={sidebarView}
      onViewChange={(view) => {
        if (sidebarView === view && $sidebarVisible) {
          sidebarVisible.set(false);
        } else {
          sidebarView = view;
          sidebarVisible.set(true);
        }
      }}
    />

    <!-- Sidebar -->
    {#if $sidebarVisible}
      <div style:width="{$sidebarWidth}px" class="shrink-0 overflow-hidden flex flex-col p-1.5">
        <!-- Sidebar content -->
        <div class="flex-1 overflow-hidden metal-frame rounded-xl">
          {#if sidebarView === "search"}
            <SearchPanel onClose={() => sidebarView = "explorer"} />
          {:else}
            <FileTree />
          {/if}
        </div>
      </div>
      <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
    {/if}

    <!-- Left dock panel -->
    {#if $leftPanelVisible}
      <div style:width="{$leftPanelWidth}px" class="shrink-0 overflow-hidden border-r border-border p-1.5">
        <div class="h-full metal-frame rounded-xl overflow-hidden">
          <TerminalPanel dock="left" />
        </div>
      </div>
      <ResizeHandle direction="horizontal" onResize={handleLeftPanelResize} />
    {/if}

    <!-- Center + right panels -->
    {#if $aiSettingsVisible}
      <AISettingsPage />
    {:else}
      <div class="flex-1 flex overflow-hidden">
        <!-- Center panel: tabs + content + bottom terminal -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Tab bar -->
          <TabBar />

          <!-- Content area + terminal -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Content -->
            <div class="flex-1 overflow-hidden">
              <ContentArea />
            </div>

            <!-- Bottom terminal — always mounted to preserve PTY sessions, hidden via CSS -->
            {#if $bottomTerminals.length > 0}
              <div class:hidden={!$terminalVisible}>
                <ResizeHandle direction="vertical" onResize={handleTerminalResize} />
              </div>
              <div
                style:height="{$terminalHeight}px"
                class="shrink-0 overflow-hidden p-1.5 pt-1"
                class:hidden={!$terminalVisible}
              >
                <div class="h-full metal-frame rounded-xl overflow-hidden">
                  <TerminalPanel dock="bottom" />
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Right panel terminal — always mounted when terminals exist to preserve PTY -->
        {#if $rightPanelVisible}
          <ResizeHandle direction="horizontal" onResize={handleRightPanelResize} />
          <div style:width="{$rightPanelWidth}px" class="shrink-0 overflow-hidden border-l border-border p-1.5">
            <div class="h-full metal-frame rounded-xl overflow-hidden">
              <TerminalPanel dock="right" />
            </div>
          </div>
        {/if}

        <!-- AI Chat Panel (right dock) -->
        {#if hasRightChats && $chatVisible}
          <ResizeHandle direction="horizontal" onResize={handleChatRightResize} />
          <div style:width="{$chatPanelWidth}px" class="shrink-0 overflow-hidden border-l border-border p-1.5">
            <ChatDockPanel dock="right" />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- AI Chat Panel (bottom dock) -->
  {#if !$aiSettingsVisible && hasBottomChats && $chatVisible}
    <ResizeHandle direction="vertical" onResize={handleChatBottomResize} />
    <div style:height="{$chatPanelHeight}px" class="shrink-0 overflow-hidden border-t border-border p-1.5 pt-1">
      <ChatDockPanel dock="bottom" />
    </div>
  {/if}

  <!-- Status bar -->
  <StatusBar />
</div>

<SettingsModal visible={$settingsVisible} onClose={() => settingsVisible.set(false)} />
<UpdateNotification />
