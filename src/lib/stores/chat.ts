import { writable, derived, get } from 'svelte/store';

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  mentions?: string[];
  steer?: string;
  isStreaming: boolean;
  toolCalls: UIToolCall[];
  timestamp: number;
}

export interface UIToolCall {
  id: string;
  name: string;
  arguments: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  isError?: boolean;
}

export interface PendingConfirmation {
  toolCallId: string;
  toolName: string;
  arguments: string;
  resolve: (confirmed: boolean) => void;
}

// ── Stores ───────────────────────────────────────────────────────────

export const chatMessages = writable<UIMessage[]>([]);
export const chatIsLoading = writable(false);
export const chatPanelVisible = writable(false);
export const chatPanelWidth = writable(420);
export const chatPanelHeight = writable(300);
export const chatPanelDock = writable<'right' | 'bottom' | 'tab'>('right');
export const pendingConfirmation = writable<PendingConfirmation | null>(null);
export const currentSessionId = writable<string | null>(null);

// ── Helpers ──────────────────────────────────────────────────────────

export function addUIMessage(
  role: UIMessage['role'],
  content: string,
  options?: { mentions?: string[]; steer?: string },
): string {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const msg: UIMessage = {
    id,
    role,
    content,
    thinking: '',
    mentions: options?.mentions,
    steer: options?.steer,
    isStreaming: false,
    toolCalls: [],
    timestamp: Date.now(),
  };
  chatMessages.update((msgs) => [...msgs, msg]);
  return id;
}

export function addStreamingMessage(): string {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const msg: UIMessage = {
    id,
    role: 'assistant',
    content: '',
    thinking: '',
    isStreaming: true,
    toolCalls: [],
    timestamp: Date.now(),
  };
  chatMessages.update((msgs) => [...msgs, msg]);
  return id;
}

export function updateStreamingMessage(id: string, content: string): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => (m.id === id ? { ...m, content } : m))
  );
}

export function appendToStreamingMessage(id: string, chunk: string): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m))
  );
}

export function appendThinkingToStreamingMessage(id: string, chunk: string): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => (m.id === id ? { ...m, thinking: (m.thinking || '') + chunk } : m))
  );
}

export function finalizeMessage(id: string): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
  );
}

export function addToolCallToMessage(messageId: string, toolCall: UIToolCall): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => {
      if (m.id !== messageId) return m;
      return { ...m, toolCalls: [...m.toolCalls, toolCall] };
    })
  );
}

export function updateToolCallStatus(
  messageId: string,
  toolCallId: string,
  status: UIToolCall['status'],
  result?: string,
  isError?: boolean,
): void {
  chatMessages.update((msgs) =>
    msgs.map((m) => {
      if (m.id !== messageId) return m;
      return {
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, status, result, isError } : tc
        ),
      };
    })
  );
}

export function clearChat(): void {
  chatMessages.set([]);
  currentSessionId.set(null);
}
