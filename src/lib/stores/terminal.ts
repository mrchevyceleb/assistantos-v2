import { writable, get } from "svelte/store";

export interface TerminalInstance {
  id: string;
  title: string;
  cwd: string;
}

export const terminalInstances = writable<TerminalInstance[]>([]);
export const activeTerminalId = writable<string | null>(null);
export const terminalVisible = writable(false);
export const terminalHeight = writable(250);

export function addTerminal(cwd: string): string {
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const count = get(terminalInstances).length + 1;
  const title = `Terminal ${count}`;

  terminalInstances.update((t) => [...t, { id, title, cwd }]);
  activeTerminalId.set(id);
  terminalVisible.set(true);
  return id;
}

export function removeTerminal(id: string) {
  const instances = get(terminalInstances);
  const idx = instances.findIndex((t) => t.id === id);
  terminalInstances.update((t) => t.filter((term) => term.id !== id));

  if (get(activeTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id);
    if (remaining.length > 0) {
      const newIdx = Math.min(idx, remaining.length - 1);
      activeTerminalId.set(remaining[newIdx].id);
    } else {
      activeTerminalId.set(null);
      terminalVisible.set(false);
    }
  }
}
