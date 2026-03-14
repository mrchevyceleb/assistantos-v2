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

export interface ClaudeCodeSession {
  id: string;
  /** "ready" = waiting for user input, "running" = process active, "error" = spawn failed */
  status: "ready" | "running" | "error";
  messages: ClaudeCodeMessage[];
  model?: string;
  /** The Claude CLI session ID (for --resume). Set from the init event. */
  claudeSessionId?: string;
  totalCost?: number;
  error?: string;
  cwd: string;
}

// ── Store ───────────────────────────────────────────────────────────

export const claudeCodeSessions = writable<Map<string, ClaudeCodeSession>>(new Map());

/**
 * Helper: immutably update a session by ID.
 * Creates a new session object (for Svelte 5 $derived referential equality)
 * and a new Map.
 */
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

let listenersInitialized = false;

function initListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  listen<{ id: string; data: string }>("claude-code-output", (event) => {
    const { id, data } = event.payload;

    // Handle stderr lines
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

    // Parse JSON line
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
        }

        // Extract cost from result - process finished this turn
        if (parsed.type === "result") {
          updates.totalCost = (s.totalCost || 0) + (parsed.total_cost_usd || 0);
          updates.status = "ready";
        }

        return updates;
      });
    } catch {
      // Non-JSON output, treat as raw text
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

/** Create a new Claude Code UI session and open its tab. No process is spawned yet. */
export function launchClaudeCode(cwd: string): string {
  initListeners();

  const id = `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const session: ClaudeCodeSession = {
    id,
    status: "ready",
    messages: [],
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

/** Send a message. Spawns a new `claude -p "message"` process (with --resume for follow-ups). */
export async function sendToClaudeCode(id: string, message: string): Promise<void> {
  const sessions = get(claudeCodeSessions);
  const session = sessions.get(id);
  if (!session) throw new Error("Session not found");
  if (session.status === "running") throw new Error("Already running");

  // Capture values we need for the spawn call before updating
  const cwd = session.cwd;
  const claudeSessionId = session.claudeSessionId;

  // Add user message to the store (immutable update)
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

  // Spawn a new process for this turn
  try {
    await spawnClaudeCode(id, cwd, message, claudeSessionId);
  } catch (err) {
    updateSession(id, () => ({
      status: "error",
      error: String(err),
    }));
  }
}

/** Kill the currently running process (if any). Session stays open for new messages. */
export async function stopClaudeCode(id: string): Promise<void> {
  await closeClaudeCode(id);
  updateSession(id, () => ({ status: "ready" }));
}

/** Destroy the UI session entirely: kill process, remove from store, close tab. */
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
