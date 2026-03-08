import { writable, type Writable } from 'svelte/store';
import type { UIMessage, PendingConfirmation } from '$lib/stores/chat';
import type { ChatEngine } from '$lib/ai/chat/chat-engine';

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
}
