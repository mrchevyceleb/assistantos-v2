import { writable, get, type Writable } from 'svelte/store';
import type { UIMessage, PendingConfirmation } from '$lib/stores/chat';
import type { ChatEngine } from '$lib/ai/chat/chat-engine';
import { saveChatSession, loadChatSession, deleteChatSession } from '$lib/utils/tauri';

export interface InstanceState {
  messages: Writable<UIMessage[]>;
  isLoading: Writable<boolean>;
  pendingConfirmation: Writable<PendingConfirmation | null>;
  engine: ChatEngine | null;
  currentStreamingId: string | null;
}

const instanceStateMap = new Map<string, InstanceState>();

export function getInstanceState(id: string): InstanceState {
  let state = instanceStateMap.get(id);
  if (!state) {
    state = {
      messages: writable<UIMessage[]>([]),
      isLoading: writable(false),
      pendingConfirmation: writable<PendingConfirmation | null>(null),
      engine: null,
      currentStreamingId: null,
    };
    instanceStateMap.set(id, state);
  }
  return state;
}

/** Clean up instance state when a chat is removed */
export function destroyInstanceState(id: string) {
  const state = instanceStateMap.get(id);
  if (state?.engine) {
    state.engine.abort();
  }
  instanceStateMap.delete(id);
  // Remove persisted messages
  deleteChatSession(`ui-${id}`).catch(() => {});
}

/** Save UI messages for a chat instance to disk */
export async function saveInstanceMessages(id: string): Promise<void> {
  const state = instanceStateMap.get(id);
  if (!state) return;
  const messages = get(state.messages);
  if (messages.length === 0) {
    // Clean up stale file if chat was cleared
    deleteChatSession(`ui-${id}`).catch(() => {});
    return;
  }
  // Strip streaming state and non-serializable fields
  const clean = messages.map(m => ({ ...m, isStreaming: false }));
  await saveChatSession(`ui-${id}`, JSON.stringify(clean));
}

/** Load UI messages for a chat instance from disk */
export async function loadInstanceMessages(id: string): Promise<void> {
  try {
    const json = await loadChatSession(`ui-${id}`);
    if (!json) return;
    const messages: UIMessage[] = JSON.parse(json);
    const state = getInstanceState(id);
    state.messages.set(messages);
  } catch {
    // No saved messages or parse error
  }
}

/** Save all active instance messages to disk */
export async function saveAllInstanceMessages(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [id] of instanceStateMap) {
    promises.push(saveInstanceMessages(id));
  }
  await Promise.allSettled(promises);
}
