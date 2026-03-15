import { writable, get } from "svelte/store";
import { listen } from "@tauri-apps/api/event";
import { spawnClaudeCode, closeClaudeCode, writeClaudeCode } from "$lib/utils/tauri";
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

function initListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Track streaming state per session (outside store to avoid unnecessary reactivity)
  const streamingState = new Map<string, { text: string; toolUses: any[]; seq: number; currentBlockType: string }>();

  listen<{ id: string; data: string }>("claude-code-output", (event) => {
    const { id, data } = event.payload;

    if (data.startsWith("[stderr] ")) {
      updateSession(id, (s) => ({
        messages: [...s.messages, {
          type: "stderr" as const,
          raw: data.slice(9),
          timestamp: Date.now(),
          seq: messageSeq++,
        }],
      }));
      return;
    }

    try {
      const parsed = JSON.parse(data);

      // ── Streaming delta handling ──
      // CLI wraps streaming events as: {"type": "stream_event", "event": {...}}
      // Unwrap to get the actual event for content_block_start/delta/stop
      const streamEvent = parsed.type === "stream_event" ? parsed.event : null;

      // message_start carries input token usage (context consumed so far)
      if (streamEvent?.type === "message_start") {
        const msgUsage = streamEvent.message?.usage;
        if (msgUsage) {
          updateSession(id, (s) => ({
            contextUsage: {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              inputTokens: msgUsage.input_tokens || 0,
              cacheReadTokens: msgUsage.cache_read_input_tokens || 0,
              cacheCreationTokens: msgUsage.cache_creation_input_tokens || 0,
            },
          }));
        }
        return;
      }

      // message_delta carries output token usage
      if (streamEvent?.type === "message_delta") {
        const deltaUsage = streamEvent.usage;
        if (deltaUsage) {
          updateSession(id, (s) => ({
            contextUsage: {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              outputTokens: deltaUsage.output_tokens || 0,
            },
          }));
        }
        return;
      }

      if (streamEvent?.type === "content_block_start") {
        if (!streamingState.has(id)) {
          streamingState.set(id, { text: "", toolUses: [], seq: messageSeq++, currentBlockType: "text" });
        }
        const state = streamingState.get(id)!;
        state.currentBlockType = streamEvent.content_block?.type || "text";
        // If it's a tool_use block, start tracking it
        if (streamEvent.content_block?.type === "tool_use") {
          state.toolUses.push({
            type: "tool_use",
            id: streamEvent.content_block.id,
            name: streamEvent.content_block.name,
            input: {},
          });
        }
        return;
      }

      if (streamEvent?.type === "content_block_delta") {
        const state = streamingState.get(id);
        if (state) {
          const delta = streamEvent.delta;
          if (delta?.type === "text_delta" && delta.text) {
            state.text += delta.text;
          } else if (delta?.type === "input_json_delta" && delta.partial_json && state.currentBlockType === "tool_use") {
            // Accumulate tool input JSON only for the current tool_use block
            const lastTool = state.toolUses[state.toolUses.length - 1];
            if (lastTool) {
              lastTool._rawInput = (lastTool._rawInput || "") + delta.partial_json;
            }
          }
          // Update the live streaming message in the session
          updateSession(id, (s) => {
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
            // Replace the streaming message (same seq) or append it
            const existingIdx = s.messages.findIndex(m => m.seq === state.seq);
            const messages = [...s.messages];
            if (existingIdx >= 0) {
              messages[existingIdx] = streamMsg;
            } else {
              messages.push(streamMsg);
            }
            return { messages };
          });
        }
        return;
      }

      if (streamEvent?.type === "content_block_stop") {
        // Block finished, but keep accumulating (there may be more blocks)
        return;
      }

      // ── Final message handling ──
      updateSession(id, (s) => {
        const updates: Partial<ClaudeCodeSession> = {};

        // Extract metadata from init message
        if (parsed.type === "system" && parsed.subtype === "init") {
          updates.model = parsed.model;
          if (parsed.session_id) {
            updates.claudeSessionId = parsed.session_id;
          }
          if (Array.isArray(parsed.slash_commands)) {
            updates.slashCommands = parsed.slash_commands;
          }
          if (parsed.model) {
            updates.contextUsage = {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              contextWindow: parseContextWindow(parsed.model),
            };
          }
        }

        // Final assistant message replaces streaming message
        if (parsed.type === "assistant") {
          const state = streamingState.get(id);
          if (state) {
            // Replace the streaming message with the final one
            const existingIdx = s.messages.findIndex(m => m.seq === state.seq);
            const messages = [...s.messages];
            const finalMsg: ClaudeCodeMessage = {
              type: "assistant",
              raw: parsed,
              timestamp: Date.now(),
              seq: state.seq,
            };
            if (existingIdx >= 0) {
              messages[existingIdx] = finalMsg;
            } else {
              messages.push(finalMsg);
            }
            updates.messages = messages;
            streamingState.delete(id);
          } else {
            // No streaming state, just append
            updates.messages = [...s.messages, {
              type: "assistant" as const,
              raw: parsed,
              timestamp: Date.now(),
              seq: messageSeq++,
            }];
          }
          const usage = extractUsage(parsed);
          if (usage) {
            updates.contextUsage = {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              ...usage,
            };
          }
        }

        // Extract cost and final usage from result
        if (parsed.type === "result") {
          updates.totalCost = (s.totalCost || 0) + (parsed.total_cost_usd || 0);
          updates.status = "ready";
          streamingState.delete(id); // Clean up any leftover streaming state
          const resultUsage = parsed.usage;
          if (resultUsage) {
            updates.contextUsage = {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              inputTokens: resultUsage.input_tokens || 0,
              outputTokens: resultUsage.output_tokens || 0,
              cacheReadTokens: resultUsage.cache_read_input_tokens || 0,
              cacheCreationTokens: resultUsage.cache_creation_input_tokens || 0,
            };
          }
        }

        // For other event types (system, error, etc.), just append as a message
        // Skip stream_event wrappers (already handled above) and assistant (handled above)
        if (!updates.messages && parsed.type !== "assistant" && parsed.type !== "stream_event") {
          const msg: ClaudeCodeMessage = {
            type: parsed.type || "error",
            raw: parsed,
            timestamp: Date.now(),
            seq: messageSeq++,
          };
          updates.messages = [...s.messages, msg];
        }

        return updates;
      });
    } catch {
      updateSession(id, (s) => ({
        messages: [...s.messages, {
          type: "stderr" as const,
          raw: data,
          timestamp: Date.now(),
          seq: messageSeq++,
        }],
      }));
    }
  });

  listen<{ id: string; exit_code: number | null }>("claude-code-closed", (event) => {
    const { id, exit_code } = event.payload;
    // Finalize any in-flight streaming message before updating session
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

async function ensureProcess(session: ClaudeCodeSession): Promise<void> {
  if (session.processAlive) return;
  const extraArgs: string[] = [];
  if (session.selectedModel) {
    extraArgs.push("--model", session.selectedModel);
  }
  // Resume from CLI session if respawning after a kill (steer, stop, model change)
  if (session.claudeSessionId) {
    extraArgs.push("--resume", session.claudeSessionId);
  }
  await spawnClaudeCode(session.id, session.cwd, extraArgs);
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
    await writeClaudeCode(id, inputMsg);
  } catch (err) {
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
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
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
