import { writable, get } from "svelte/store";
import { listen } from "@tauri-apps/api/event";
import { spawnClaudeCode, closeClaudeCode } from "$lib/utils/tauri";
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
  claudeSessionId?: string;
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
      updateSession(id, (s) => {
        const msg: ClaudeCodeMessage = {
          type: parsed.type || "error",
          raw: parsed,
          timestamp: Date.now(),
          seq: messageSeq++,
        };

        const updates: Partial<ClaudeCodeSession> = {
          messages: [...s.messages, msg],
        };

        // Extract metadata from init message
        if (parsed.type === "system" && parsed.subtype === "init") {
          updates.model = parsed.model;
          if (parsed.session_id) {
            updates.claudeSessionId = parsed.session_id;
          }
          // Capture slash commands
          if (Array.isArray(parsed.slash_commands)) {
            updates.slashCommands = parsed.slash_commands;
          }
          // Initialize context window from model
          if (parsed.model) {
            updates.contextUsage = {
              ...(s.contextUsage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, contextWindow: 200_000 }),
              contextWindow: parseContextWindow(parsed.model),
            };
          }
        }

        // Update context usage from assistant messages
        if (parsed.type === "assistant") {
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
          // Result has cumulative usage for the turn
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
    updateSession(id, (s) => {
      if (s.status !== "running") return {};
      if (exit_code !== null && exit_code !== 0) {
        return { status: "error", error: `Claude process exited with code ${exit_code}` };
      }
      return { status: "ready" };
    });
  });
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
  };

  claudeCodeSessions.update((sessions) => {
    const next = new Map(sessions);
    next.set(id, session);
    return next;
  });

  openClaudeCodeTab(id, "Claude Code");
  return id;
}

export async function sendToClaudeCode(id: string, message: string): Promise<void> {
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  if (!session) throw new Error("Session not found");
  if (session.status === "running") throw new Error("Already running");

  const cwd = session.cwd;
  const claudeSessionId = session.claudeSessionId;
  const selectedModel = session.selectedModel;

  updateSession(id, (s) => ({
    messages: [...s.messages, {
      type: "user" as const,
      raw: message,
      timestamp: Date.now(),
      seq: messageSeq++,
    }],
    status: "running",
    error: undefined,
  }));

  try {
    const extraArgs: string[] = [];
    if (selectedModel) {
      extraArgs.push("--model", selectedModel);
    }
    await spawnClaudeCode(id, cwd, message, claudeSessionId, extraArgs);
  } catch (err) {
    updateSession(id, () => ({
      status: "error",
      error: String(err),
    }));
  }
}

export function setClaudeCodeModel(id: string, model: string): void {
  updateSession(id, () => ({ selectedModel: model || undefined }));
}

export async function stopClaudeCode(id: string): Promise<void> {
  await closeClaudeCode(id);
  updateSession(id, () => ({ status: "ready" }));
}

export function removeClaudeCodeSession(id: string): void {
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  if (session && session.status === "running") {
    closeClaudeCode(id).catch(() => {});
  }
  claudeCodeSessions.update((sessions) => {
    const next = new Map(sessions);
    next.delete(id);
    return next;
  });
  closeClaudeCodeTab(id);
}
