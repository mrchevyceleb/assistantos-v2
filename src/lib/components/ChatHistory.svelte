<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { ChatSession } from "$lib/ai/chat/session";
  import {
    restoreClaudeCodeSession,
    claudeCodeSessions,
  } from "$lib/stores/claude-code";
  import { openClaudeCodeTab } from "$lib/stores/tabs";
  import { addChat } from "$lib/stores/chat-instances";
  import { getInstanceState } from "$lib/stores/chat-instance-state";
  import { settings } from "$lib/stores/settings";
  import { deleteChatSession, loadChatSession } from "$lib/utils/tauri";

  interface HistoryEntry {
    id: string;
    type: "chat" | "claude-code";
    preview: string;
    model?: string;
    createdAt: number;
    updatedAt: number;
  }

  let entries = $state<HistoryEntry[]>([]);
  let isLoading = $state(true);

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(ts).toLocaleDateString();
  }

  function extractPreview(json: string, isCc: boolean): { preview: string; model?: string; createdAt: number; updatedAt: number } {
    try {
      const data = JSON.parse(json);
      if (isCc) {
        // Claude Code session format: messages are ClaudeCodeMessage[]
        const msgs = data.messages || [];
        const firstUser = msgs.find((m: any) => m.type === "user");
        const preview = firstUser?.raw?.text
          ? firstUser.raw.text.slice(0, 100)
          : "Claude Code session";
        const createdAt = msgs[0]?.timestamp || Date.now();
        const updatedAt = msgs[msgs.length - 1]?.timestamp || Date.now();
        return { preview, model: data.model || data.selectedModel, createdAt, updatedAt };
      } else {
        // AI Chat session format: messages are ChatMessage[]
        const msgs = data.messages || [];
        const firstUser = msgs.find((m: any) => m.role === "user");
        const preview = firstUser?.content
          ? (typeof firstUser.content === "string" ? firstUser.content : "[media]").slice(0, 100)
          : "Empty chat";
        return {
          preview,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        };
      }
    } catch {
      return { preview: isCc ? "Claude Code session" : "Chat session", createdAt: Date.now(), updatedAt: Date.now() };
    }
  }

  async function loadEntries() {
    isLoading = true;
    const all: HistoryEntry[] = [];

    try {
      const allIds = await ChatSession.listAll();
      for (const id of allIds.filter(i => !i.startsWith("ui-"))) {
        try {
          const json = await loadChatSession(id);
          const isCc = id.startsWith("cc-");
          const info = extractPreview(json, isCc);
          all.push({
            id,
            type: isCc ? "claude-code" : "chat",
            preview: info.preview,
            model: info.model,
            createdAt: info.createdAt,
            updatedAt: info.updatedAt,
          });
        } catch {
          // Skip broken sessions
        }
      }
    } catch {
      // No sessions at all
    }

    // Sort by most recent first
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    entries = all;
    isLoading = false;
  }

  async function handleDelete(entry: HistoryEntry) {
    const label = entry.type === "chat" ? "chat" : "Claude Code session";
    const confirmed = await ask(`Delete this ${label}? This cannot be undone.`, {
      title: "Delete History",
      kind: "warning",
    });
    if (!confirmed) return;

    try {
      await deleteChatSession(entry.id);
      entries = entries.filter((e) => e.id !== entry.id);
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  async function handleOpen(entry: HistoryEntry) {
    if (entry.type === "chat") {
      try {
        const session = await ChatSession.load(entry.id);
        const s = get(settings);
        const chatId = addChat(s.aiModel, s.aiProvider, "tab");
        // Populate the instance state with loaded messages
        const state = getInstanceState(chatId);
        const uiMessages = session.getMessages().map((m) => ({
          id: `hist-${Math.random().toString(36).slice(2)}`,
          role: m.role as "user" | "assistant" | "system",
          content: m.content || "",
          isStreaming: false,
          toolCalls: (m.tool_calls || []).map((tc) => ({
            id: tc.id,
            name: tc.function?.name || "",
            arguments: tc.function?.arguments || "",
            status: "success" as const,
            result: undefined,
          })),
          timestamp: Date.now(),
        }));
        state.messages.set(uiMessages);
      } catch (err) {
        console.error("Failed to load chat session:", err);
      }
    } else {
      // Claude Code: restore session and open tab
      try {
        // The stored ID is "cc-{sessionId}", extract the actual session ID
        const sessionId = entry.id.slice(3); // remove "cc-" prefix
        const restored = await restoreClaudeCodeSession(sessionId);
        if (restored) {
          openClaudeCodeTab(sessionId, "Claude Code");
        }
      } catch (err) {
        console.error("Failed to restore Claude Code session:", err);
      }
    }
  }

  onMount(() => {
    loadEntries();
  });
</script>

<div class="flex flex-col h-full glass-panel-solid" style="padding: 8px;">
  <!-- Header -->
  <div class="border-b border-border" style="padding: 4px 4px 10px 4px;">
    <div class="flex items-center justify-between" style="padding: 4px 0;">
      <span class="text-sm font-semibold text-text-secondary" style="letter-spacing: 0.05em;">CHAT HISTORY</span>
      <button
        class="history-refresh-btn"
        onclick={() => loadEntries()}
        title="Refresh"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Entries list -->
  <div class="flex-1 overflow-y-auto" style="padding-top: 6px;">
    {#if isLoading}
      <div class="flex items-center justify-center" style="padding: 32px 0;">
        <span class="text-xs text-text-muted">Loading history...</span>
      </div>
    {:else if entries.length === 0}
      <div class="flex flex-col items-center justify-center" style="padding: 32px 16px; gap: 8px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity: 0.3;">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="text-xs text-text-muted text-center">No chat history yet. Closed chats will appear here.</span>
      </div>
    {:else}
      {#each entries as entry (entry.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="history-entry"
          onclick={() => handleOpen(entry)}
          onkeydown={(e) => { if (e.key === 'Enter') handleOpen(entry); }}
          role="button"
          tabindex="0"
          title={entry.preview}
        >
          <div class="flex items-start" style="gap: 8px;">
            <!-- Type icon -->
            <div class="history-icon" class:cc-icon={entry.type === "claude-code"}>
              {#if entry.type === "chat"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
                </svg>
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polyline points="4 17 10 11 4 5"/>
                  <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
              {/if}
            </div>
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="history-preview">{entry.preview}</div>
              <div class="history-meta">
                <span>{relativeTime(entry.updatedAt)}</span>
                {#if entry.model}
                  <span class="history-model">{entry.model}</span>
                {/if}
              </div>
            </div>
            <!-- Delete button -->
            <button
              class="history-delete"
              onclick={(e) => { e.stopPropagation(); handleDelete(entry); }}
              title="Delete"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .history-refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    background: none;
    border: none;
  }
  .history-refresh-btn:hover {
    color: var(--color-text-secondary);
    background: rgba(255, 255, 255, 0.05);
  }

  .history-entry {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px;
    margin-bottom: 2px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
    background: none;
    border: none;
    color: inherit;
  }
  .history-entry:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .history-entry:hover .history-delete {
    opacity: 1;
  }

  .history-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: rgba(88, 180, 208, 0.1);
    color: var(--color-accent);
    margin-top: 1px;
  }
  .history-icon.cc-icon {
    background: rgba(168, 130, 255, 0.1);
    color: #a882ff;
  }

  .history-preview {
    font-size: 12px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
  }

  .history-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .history-model {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-delete {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
    background: none;
    border: none;
    margin-top: 1px;
  }
  .history-delete:hover {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }
</style>
