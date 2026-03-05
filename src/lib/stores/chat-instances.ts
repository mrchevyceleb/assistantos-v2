import { writable, derived, get } from 'svelte/store';
import { openChatInstanceTab, closeChatInstanceTab } from '$lib/stores/tabs';

export type ChatDock = 'right' | 'bottom' | 'tab';

export interface ChatInstance {
  id: string;
  title: string;
  model: string;
  provider: string;
  dock: ChatDock;
}

export const chatInstances = writable<ChatInstance[]>([]);
export const activeChatId = writable<string | null>(null);
export const chatVisible = writable(false);
export const chatPanelWidth = writable(420);
export const chatPanelHeight = writable(300);

// Derived: chats grouped by dock position
export const bottomChats = derived(chatInstances, ($c) =>
  $c.filter((c) => c.dock === 'bottom')
);
export const tabChats = derived(chatInstances, ($c) =>
  $c.filter((c) => c.dock === 'tab')
);
export const rightChats = derived(chatInstances, ($c) =>
  $c.filter((c) => c.dock === 'right')
);

export const activeBottomChatId = writable<string | null>(null);
export const activeRightChatId = writable<string | null>(null);

export function addChat(
  model: string,
  provider: string,
  dock: ChatDock = 'right',
): string {
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const count = get(chatInstances).length + 1;
  const title = `Chat ${count}`;

  chatInstances.update((c) => [...c, { id, title, model, provider, dock }]);

  if (dock === 'right') {
    activeRightChatId.set(id);
    chatVisible.set(true);
  } else if (dock === 'bottom') {
    activeBottomChatId.set(id);
    chatVisible.set(true);
  } else if (dock === 'tab') {
    openChatInstanceTab(id, title);
  }

  return id;
}

export function removeChat(id: string) {
  const instances = get(chatInstances);
  const inst = instances.find((c) => c.id === id);
  const idx = instances.findIndex((c) => c.id === id);
  chatInstances.update((c) => c.filter((chat) => chat.id !== id));

  if (!inst) return;

  if (inst.dock === 'tab') {
    closeChatInstanceTab(id);
  }

  if (inst.dock === 'right' && get(activeRightChatId) === id) {
    const remaining = instances.filter((c) => c.id !== id && c.dock === 'right');
    if (remaining.length > 0) {
      const newIdx = Math.min(idx, remaining.length - 1);
      activeRightChatId.set(remaining[newIdx].id);
    } else {
      activeRightChatId.set(null);
    }
  } else if (inst.dock === 'bottom' && get(activeBottomChatId) === id) {
    const remaining = instances.filter((c) => c.id !== id && c.dock === 'bottom');
    if (remaining.length > 0) {
      const newIdx = Math.min(idx, remaining.length - 1);
      activeBottomChatId.set(remaining[newIdx].id);
    } else {
      activeBottomChatId.set(null);
    }
  }
}

export function moveChat(id: string, newDock: ChatDock) {
  const instances = get(chatInstances);
  const inst = instances.find((c) => c.id === id);
  if (!inst || inst.dock === newDock) return;

  const oldDock = inst.dock;

  // If leaving "tab" dock, close the document tab
  if (oldDock === 'tab') {
    closeChatInstanceTab(id);
  }

  // Update the dock position
  chatInstances.update((c) =>
    c.map((chat) => (chat.id === id ? { ...chat, dock: newDock } : chat))
  );

  // Handle active state for old dock
  if (oldDock === 'right' && get(activeRightChatId) === id) {
    const remaining = instances.filter((c) => c.id !== id && c.dock === 'right');
    activeRightChatId.set(remaining.length > 0 ? remaining[0].id : null);
  } else if (oldDock === 'bottom' && get(activeBottomChatId) === id) {
    const remaining = instances.filter((c) => c.id !== id && c.dock === 'bottom');
    activeBottomChatId.set(remaining.length > 0 ? remaining[0].id : null);
  }

  // Set active state for new dock
  if (newDock === 'right') {
    activeRightChatId.set(id);
    chatVisible.set(true);
  } else if (newDock === 'bottom') {
    activeBottomChatId.set(id);
    chatVisible.set(true);
  } else if (newDock === 'tab') {
    openChatInstanceTab(id, inst.title);
  }
}

export function updateChatTitle(id: string, title: string) {
  chatInstances.update((c) =>
    c.map((chat) => (chat.id === id ? { ...chat, title } : chat))
  );
}

export function updateChatModel(id: string, model: string) {
  chatInstances.update((c) =>
    c.map((chat) => (chat.id === id ? { ...chat, model } : chat))
  );
}
