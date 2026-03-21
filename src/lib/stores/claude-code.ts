import { writable, get } from "svelte/store";
import { listen } from "@tauri-apps/api/event";
import { spawnClaudeCode, closeClaudeCode, writeClaudeCode, saveChatSession, loadChatSession } from "$lib/utils/tauri";
import { openClaudeCodeTab, closeClaudeCodeTab } from "$lib/stores/tabs";

// ── Types ───────────────────────────────────────────────────────────

let messageSeq = 0;

export interface ClaudeCodeMessage {
  type: "system" | "assistant" | "user" | "tool_result" | "result" | "rate_limit_event" | "error" | "stderr";
  raw: any;
  timestamp: number;
  seq: number;
}

export interface ContextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  contextWindow: number;
}

export interface ClaudeCodeSession {
  id: string;
  status: "ready" | "running" | "error";
  messages: ClaudeCodeMessage[];
  model?: string;
  /** User-selected model override (passed as --model) */
  selectedModel?: string;
  processAlive: boolean;
  /** CLI session ID for --resume when respawning after process kill */
  claudeSessionId?: string;
  /** Process needs restart (e.g. model changed while running) */
  pendingModelRestart: boolean;
  /** Set before deliberate kills to suppress spurious error from claude-code-closed */
  deliberateKill?: boolean;
  totalCost?: number;
  contextUsage?: ContextUsage;
  /** Slash commands available from the CLI */
  slashCommands: string[];
  error?: string;
  cwd: string;
}

// ── Store ───────────────────────────────────────────────────────────

export const claudeCodeSessions = writable<Map<string, ClaudeCodeSession>>(new Map());

function updateSession(id: string, updater: (session: ClaudeCodeSession) => Partial<ClaudeCodeSession>) {
  claudeCodeSessions.update((sessions) => {
    const session = sessions.get(id);
    if (!session) return sessions;
    const updates = updater(session);
    const next = new Map(sessions);
    next.set(id, { ...session, ...updates });
    return next;
  });
}

/** Parse context window size from model string like "claude-opus-4-6[1m]" */
function parseContextWindow(model: string): number {
  // Check for explicit context window in brackets like [1m] or [200k]
  const match = model.match(/\[(\d+)([km])\]/i);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return unit === "m" ? num * 1_000_000 : num * 1_000;
  }
  // Defaults by model family
  if (model.includes("opus")) return 1_000_000;
  if (model.includes("sonnet")) return 200_000;
  if (model.includes("haiku")) return 200_000;
  return 200_000;
}

/** Safe fallback that preserves an already-parsed contextWindow (e.g. 1M for Opus) */
function getContextBase(existing?: ContextUsage): ContextUsage {
  return existing ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 };
}

/** Extract usage data from an assistant or result message */
function extractUsage(parsed: any): Partial<ContextUsage> | null {
  const usage = parsed.usage || parsed.message?.usage;
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens || 0,
  };
}

let listenersInitialized = false;

// Track streaming state per session (outside store to avoid unnecessary reactivity)
const streamingState = new Map<string, { text: string; toolUses: any[]; seq: number; currentBlockType: string }>();

// Pending usage updates (batched to avoid unthrottled updateSession calls)
const pendingUsage = new Map<string, Partial<ContextUsage>>();

// Throttle store updates for streaming deltas to avoid flooding Svelte reactivity
const STREAM_FLUSH_INTERVAL_MS = 80;
const pendingFlush = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleStreamFlush(id: string) {
  if (pendingFlush.has(id)) return; // already scheduled
  pendingFlush.set(id, setTimeout(() => {
    pendingFlush.delete(id);
    flushStreamToStore(id);
  }, STREAM_FLUSH_INTERVAL_MS));
}

function flushStreamToStore(id: string) {
  const state = streamingState.get(id);
  const usage = pendingUsage.get(id);
  if (!state && !usage) return;

  updateSession(id, (s) => {
    const updates: Partial<ClaudeCodeSession> = {};

    // Flush pending usage updates
    if (usage) {
      updates.contextUsage = {
        ...getContextBase(s.contextUsage),
        ...usage,
      };
      pendingUsage.delete(id);
    }

    // Flush streaming message
    if (state) {
      const streamMsg: ClaudeCodeMessage = {
        type: "assistant",
        raw: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              ...(state.text ? [{ type: "text", text: state.text }] : []),
              ...state.toolUses.map(t => ({ ...t })),
            ],
          },
        },
        timestamp: Date.now(),
        seq: state.seq,
      };
      const existingIdx = s.messages.findIndex(m => m.seq === state.seq);
      const messages = [...s.messages];
      if (existingIdx >= 0) {
        messages[existingIdx] = streamMsg;
      } else {
        messages.push(streamMsg);
      }
      updates.messages = messages;
    }

    return updates;
  });
}

function cancelStreamFlush(id: string) {
  const timer = pendingFlush.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingFlush.delete(id);
  }
}

function initListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  listen<{ id: string; lines: string[] }>("claude-code-output", (event) => {
    const { id, lines } = event.payload;
    if (!Array.isArray(lines)) {
      console.error("[CC] Unexpected payload format - lines is not an array:", event.payload);
      return;
    }
    console.debug("[CC] batch", id.slice(-8), lines.length, "lines", lines.map(l => l.slice(0, 60)));

    // Process the entire batch, accumulating non-streaming updates into a single
    // updateSession call at the end. This prevents N store updates (and N Svelte
    // reactive cascades) per batch, which was the primary cause of main-thread starvation.
    let batchUpdates: Partial<ClaudeCodeSession> | null = null;
    let batchMessages: ClaudeCodeMessage[] | null = null;
    // Track whether we need a store update at all for this batch
    let needsStoreUpdate = false;

    // Helper: get the messages array we're building up (lazy-copies from session)
    function getMessages(): ClaudeCodeMessage[] {
      if (batchMessages) return batchMessages;
      const sessions = get(claudeCodeSessions);
      const session = sessions.get(id);
      batchMessages = session ? [...session.messages] : [];
      return batchMessages;
    }

    function ensureBatchUpdates(): Partial<ClaudeCodeSession> {
      if (!batchUpdates) batchUpdates = {};
      needsStoreUpdate = true;
      return batchUpdates;
    }

    for (const data of lines) {
      if (data.startsWith("[stderr] ")) {
        const msgs = getMessages();
        msgs.push({
          type: "stderr" as const,
          raw: data.slice(9),
          timestamp: Date.now(),
          seq: messageSeq++,
        });
        ensureBatchUpdates().messages = msgs;
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        const msgs = getMessages();
        msgs.push({
          type: "stderr" as const,
          raw: data,
          timestamp: Date.now(),
          seq: messageSeq++,
        });
        ensureBatchUpdates().messages = msgs;
        continue;
      }

      // ── Streaming delta handling ──
      const streamEvent = parsed.type === "stream_event" ? parsed.event : null;

      // message_start carries input token usage - accumulate, don't flush
      if (streamEvent?.type === "message_start") {
        const msgUsage = streamEvent.message?.usage;
        if (msgUsage) {
          pendingUsage.set(id, {
            ...(pendingUsage.get(id) || {}),
            inputTokens: msgUsage.input_tokens || 0,
            cacheReadTokens: msgUsage.cache_read_input_tokens || 0,
            cacheCreationTokens: msgUsage.cache_creation_input_tokens || 0,
          });
          scheduleStreamFlush(id);
        }
        continue;
      }

      // message_delta carries output token usage - accumulate, don't flush
      if (streamEvent?.type === "message_delta") {
        const deltaUsage = streamEvent.usage;
        if (deltaUsage) {
          pendingUsage.set(id, {
            ...(pendingUsage.get(id) || {}),
            outputTokens: deltaUsage.output_tokens || 0,
          });
          scheduleStreamFlush(id);
        }
        continue;
      }

      if (streamEvent?.type === "content_block_start") {
        if (!streamingState.has(id)) {
          streamingState.set(id, { text: "", toolUses: [], seq: messageSeq++, currentBlockType: "text" });
        }
        const state = streamingState.get(id)!;
        state.currentBlockType = streamEvent.content_block?.type || "text";
        if (streamEvent.content_block?.type === "tool_use") {
          state.toolUses.push({
            type: "tool_use",
            id: streamEvent.content_block.id,
            name: streamEvent.content_block.name,
            input: {},
          });
        }
        continue;
      }

      if (streamEvent?.type === "content_block_delta") {
        const state = streamingState.get(id);
        if (state) {
          const delta = streamEvent.delta;
          if (delta?.type === "text_delta" && delta.text) {
            state.text += delta.text;
          } else if (delta?.type === "input_json_delta" && delta.partial_json && state.currentBlockType === "tool_use") {
            const lastTool = state.toolUses[state.toolUses.length - 1];
            if (lastTool) {
              lastTool._rawInput = (lastTool._rawInput || "") + delta.partial_json;
            }
          }
          scheduleStreamFlush(id);
        }
        continue;
      }

      if (streamEvent?.type === "content_block_stop") {
        continue;
      }

      // ── Final message handling (non-streaming) ──
      const updates = ensureBatchUpdates();

      if (parsed.type === "system" && parsed.subtype === "init") {
        updates.model = parsed.model;
        if (parsed.session_id) updates.claudeSessionId = parsed.session_id;
        if (Array.isArray(parsed.slash_commands) && parsed.slash_commands.length > 0) updates.slashCommands = parsed.slash_commands;
        if (parsed.model) {
          const sessions = get(claudeCodeSessions);
          const session = sessions.get(id);
          updates.contextUsage = {
            ...getContextBase(session?.contextUsage),
            contextWindow: parseContextWindow(parsed.model),
          };
        }
      }

      if (parsed.type === "assistant") {
        cancelStreamFlush(id);
        pendingUsage.delete(id);
        const state = streamingState.get(id);
        const msgs = getMessages();
        if (state) {
          const existingIdx = msgs.findIndex(m => m.seq === state.seq);
          const finalMsg: ClaudeCodeMessage = {
            type: "assistant",
            raw: parsed,
            timestamp: Date.now(),
            seq: state.seq,
          };
          if (existingIdx >= 0) {
            msgs[existingIdx] = finalMsg;
          } else {
            msgs.push(finalMsg);
          }
          streamingState.delete(id);
        } else {
          msgs.push({
            type: "assistant" as const,
            raw: parsed,
            timestamp: Date.now(),
            seq: messageSeq++,
          });
        }
        updates.messages = msgs;
        const usage = extractUsage(parsed);
        if (usage) {
          const sessions = get(claudeCodeSessions);
          const session = sessions.get(id);
          updates.contextUsage = {
            ...getContextBase(session?.contextUsage),
            ...usage,
          };
        }
      }

      if (parsed.type === "result") {
        const sessions = get(claudeCodeSessions);
        const session = sessions.get(id);
        updates.totalCost = (session?.totalCost || 0) + (parsed.total_cost_usd || 0);
        updates.status = "ready";
        cancelStreamFlush(id);
        pendingUsage.delete(id);
        streamingState.delete(id);
        // Note: CLI result events don't carry a usage field.
        // Context usage is tracked via message_start/message_delta stream events.
        // Append result message so the cost summary card renders in the UI
        const msgs = getMessages();
        msgs.push({ type: "result" as const, raw: parsed, timestamp: Date.now(), seq: messageSeq++ });
        updates.messages = msgs;
      }

      // For other event types (system, error, etc.), just append as a message
      if (parsed.type !== "assistant" && parsed.type !== "result" && parsed.type !== "stream_event") {
        const msgs = getMessages();
        msgs.push({
          type: parsed.type || "error",
          raw: parsed,
          timestamp: Date.now(),
          seq: messageSeq++,
        });
        updates.messages = msgs;
      }
    }

    // Single store update for the entire batch
    if (needsStoreUpdate && batchUpdates) {
      const finalUpdates = batchUpdates as Partial<ClaudeCodeSession>;
      if (batchMessages && !finalUpdates.messages) {
        finalUpdates.messages = batchMessages;
      }
      updateSession(id, () => finalUpdates);
    }
  });

  listen<{ id: string; exit_code: number | null }>("claude-code-closed", (event) => {
    const { id, exit_code } = event.payload;
    // Finalize any in-flight streaming message before updating session
    cancelStreamFlush(id);
    const orphanedStream = streamingState.get(id);
    if (orphanedStream) {
      streamingState.delete(id);
    }
    updateSession(id, (s) => {
      const updates: Partial<ClaudeCodeSession> = { processAlive: false };
      // If there was an orphaned streaming message, stamp it so isStreaming becomes false
      if (orphanedStream) {
        const idx = s.messages.findIndex(m => m.seq === orphanedStream.seq);
        if (idx >= 0) {
          const messages = [...s.messages];
          const msg = { ...messages[idx] };
          msg.raw = { ...msg.raw, message: { ...msg.raw.message, stop_reason: "interrupted" } };
          messages[idx] = msg;
          updates.messages = messages;
        }
      }
      // Only set error status if the process crashed unexpectedly while running.
      // If status is already "ready" (deliberate stop/steer) or "error", don't override.
      if (s.status === "running") {
        if (s.deliberateKill) {
          updates.status = "ready";
          updates.deliberateKill = false;
        } else if (exit_code !== null && exit_code !== 0) {
          updates.status = "error";
          updates.error = `Claude process exited with code ${exit_code}`;
        } else {
          updates.status = "ready";
        }
      }
      return updates;
    });
  });
}

async function ensureProcess(session: ClaudeCodeSession, prompt?: string): Promise<void> {
  if (session.processAlive) return;
  const extraArgs: string[] = [];
  if (session.selectedModel) {
    extraArgs.push("--model", session.selectedModel);
  }
  // Resume from CLI session if respawning after a kill (steer, stop, model change)
  if (session.claudeSessionId) {
    extraArgs.push("--resume", session.claudeSessionId);
  }
  await spawnClaudeCode(session.id, session.cwd, extraArgs, prompt);
  updateSession(session.id, () => ({ processAlive: true }));
}

// ── Actions ─────────────────────────────────────────────────────────

export function launchClaudeCode(cwd: string): string {
  initListeners();

  const id = `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const session: ClaudeCodeSession = {
    id,
    status: "ready",
    messages: [],
    slashCommands: [],
    cwd,
    processAlive: false,
    pendingModelRestart: false,
  };

  claudeCodeSessions.update((sessions) => {
    const next = new Map(sessions);
    next.set(id, session);
    return next;
  });

  openClaudeCodeTab(id, "Claude Code");
  return id;
}

export interface ImageAttachment {
  mediaType: string;
  base64: string;
}

export async function sendToClaudeCode(id: string, message: string, images?: ImageAttachment[]): Promise<void> {
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  if (!session) throw new Error("Session not found");
  if (session.status === "running") throw new Error("Already running");

  updateSession(id, (s) => ({
    messages: [...s.messages, {
      type: "user" as const,
      raw: { text: message, images: images?.map(img => ({ base64: img.base64, mediaType: img.mediaType })) },
      timestamp: Date.now(),
      seq: messageSeq++,
    }],
    status: "running",
    error: undefined,
  }));

  try {
    // Always re-read fresh session state (the original snapshot may be stale if
    // claude-code-closed fired between get() and here)
    let current = get(claudeCodeSessions).get(id);
    if (!current) throw new Error("Session lost");

    // If model changed while running, kill process so ensureProcess respawns with new model
    if (current.pendingModelRestart && current.processAlive) {
      updateSession(id, () => ({ deliberateKill: true }));
      await closeClaudeCode(id);
      updateSession(id, () => ({ processAlive: false, pendingModelRestart: false, deliberateKill: false }));
      current = get(claudeCodeSessions).get(id);
      if (!current) throw new Error("Session lost during model restart");
    }

    // Check if message is a CLI slash command (e.g. /compact, /clear)
    // These must be sent via one-shot -p mode, not stdin JSON protocol
    // Fallback list covers fresh/restored sessions where slashCommands hasn't been populated yet
    const KNOWN_CLI_COMMANDS = ["compact", "clear", "config", "cost", "doctor", "help", "init", "login", "logout", "memory", "mcp", "permissions", "review", "status", "terminal-setup"];
    const slashMatch = message.match(/^\/(\S+)/);
    const isCliSlashCommand = slashMatch &&
      (current.slashCommands.includes(slashMatch[1]) || KNOWN_CLI_COMMANDS.includes(slashMatch[1]));

    if (isCliSlashCommand && current.claudeSessionId) {
      // Kill current pipe-mode process
      if (current.processAlive) {
        updateSession(id, () => ({ deliberateKill: true }));
        await closeClaudeCode(id);
        updateSession(id, () => ({ processAlive: false, deliberateKill: false }));
        current = get(claudeCodeSessions).get(id);
        if (!current) throw new Error("Session lost during slash command");
      }
      // Mark as deliberate so claude-code-closed always resolves to "ready"
      // (slash commands may exit non-zero for "nothing to do" which isn't an error)
      updateSession(id, () => ({ deliberateKill: true }));
      // Spawn one-shot process with -p "/compact" --resume
      await ensureProcess({ ...current, processAlive: false }, message);
      return; // Don't write to stdin; -p already carries the message
    }

    await ensureProcess(current);

    // Build content: text + optional images in Anthropic content block format
    let content: any;
    if (images && images.length > 0) {
      content = [];
      for (const img of images) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.base64,
          },
        });
      }
      if (message) {
        content.push({ type: "text", text: message });
      }
    } else {
      content = message;
    }

    const inputMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content }
    });
    console.debug("[CC] writing to stdin:", inputMsg.slice(0, 120));
    await writeClaudeCode(id, inputMsg);
    console.debug("[CC] write ok");
  } catch (err) {
    console.error("[CC] write error:", err);
    updateSession(id, () => ({ status: "error", error: String(err) }));
  }
}

export function setClaudeCodeModel(id: string, model: string): void {
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  updateSession(id, () => ({ selectedModel: model || undefined }));
  if (session?.processAlive) {
    if (session.status === "running") {
      // Can't kill mid-run; flag for restart when the run finishes
      updateSession(id, () => ({ pendingModelRestart: true }));
    } else {
      updateSession(id, () => ({ deliberateKill: true }));
      closeClaudeCode(id).catch(() => {});
      updateSession(id, () => ({ processAlive: false }));
    }
  }
}

export async function stopClaudeCode(id: string): Promise<void> {
  updateSession(id, () => ({ deliberateKill: true }));
  await closeClaudeCode(id);
  updateSession(id, () => ({ status: "ready", processAlive: false }));
}

export function removeClaudeCodeSession(id: string): void {
  cancelStreamFlush(id);
  streamingState.delete(id);
  pendingUsage.delete(id);
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  // Save session to disk for chat history before removing from memory
  if (session && session.messages.length > 0) {
    const data: SerializedCCSession = {
      id: session.id,
      messages: session.messages,
      claudeSessionId: session.claudeSessionId,
      selectedModel: session.selectedModel,
      totalCost: session.totalCost,
      contextUsage: session.contextUsage,
      cwd: session.cwd,
      model: session.model,
      slashCommands: session.slashCommands,
    };
    saveChatSession(`cc-${id}`, JSON.stringify(data)).catch(() => {});
  }
  if (session?.processAlive) {
    closeClaudeCode(id).catch(() => {});
  }
  claudeCodeSessions.update((sessions) => {
    const next = new Map(sessions);
    next.delete(id);
    return next;
  });
  closeClaudeCodeTab(id);
}

// ── Persistence ─────────────────────────────────────────────────────

interface SerializedCCSession {
  id: string;
  messages: ClaudeCodeMessage[];
  claudeSessionId?: string;
  selectedModel?: string;
  totalCost?: number;
  contextUsage?: ContextUsage;
  cwd: string;
  model?: string;
  slashCommands: string[];
}

/** Save all Claude Code sessions to disk */
export async function saveClaudeCodeSessions(): Promise<void> {
  const sessions = get(claudeCodeSessions);
  const promises: Promise<void>[] = [];
  for (const [id, session] of sessions) {
    if (session.messages.length === 0) continue;
    const data: SerializedCCSession = {
      id: session.id,
      messages: session.messages,
      claudeSessionId: session.claudeSessionId,
      selectedModel: session.selectedModel,
      totalCost: session.totalCost,
      contextUsage: session.contextUsage,
      cwd: session.cwd,
      model: session.model,
      slashCommands: session.slashCommands,
    };
    promises.push(saveChatSession(`cc-${id}`, JSON.stringify(data)));
  }
  await Promise.allSettled(promises);
}

/** Get metadata for all Claude Code sessions (for app state, no messages) */
export function getClaudeCodeSessionMeta(): Array<{
  id: string;
  claudeSessionId?: string;
  selectedModel?: string;
  totalCost?: number;
  cwd: string;
  model?: string;
}> {
  const sessions = get(claudeCodeSessions);
  const result: Array<{
    id: string;
    claudeSessionId?: string;
    selectedModel?: string;
    totalCost?: number;
    cwd: string;
    model?: string;
  }> = [];
  for (const [, session] of sessions) {
    if (session.messages.length === 0) continue;
    result.push({
      id: session.id,
      claudeSessionId: session.claudeSessionId,
      selectedModel: session.selectedModel,
      totalCost: session.totalCost,
      cwd: session.cwd,
      model: session.model,
    });
  }
  return result;
}

/** Restore a Claude Code session from disk */
export async function restoreClaudeCodeSession(sessionId: string): Promise<boolean> {
  try {
    const json = await loadChatSession(`cc-${sessionId}`);
    if (!json) return false;
    const data: SerializedCCSession = JSON.parse(json);

    initListeners();

    const session: ClaudeCodeSession = {
      id: data.id,
      status: "ready",
      messages: data.messages,
      model: data.model,
      selectedModel: data.selectedModel,
      processAlive: false,
      claudeSessionId: data.claudeSessionId,
      pendingModelRestart: false,
      totalCost: data.totalCost,
      contextUsage: data.contextUsage,
      slashCommands: data.slashCommands || [],
      cwd: data.cwd,
    };

    claudeCodeSessions.update((sessions) => {
      const next = new Map(sessions);
      next.set(data.id, session);
      return next;
    });

    // Update messageSeq to avoid collisions
    const maxSeq = data.messages.reduce((max, m) => Math.max(max, m.seq), 0);
    if (maxSeq >= messageSeq) {
      messageSeq = maxSeq + 1;
    }

    return true;
  } catch {
    return false;
  }
}
