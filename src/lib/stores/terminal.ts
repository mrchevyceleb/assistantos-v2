import { writable, derived, get } from "svelte/store";
import { openTerminalTab, closeTerminalTab } from "$lib/stores/tabs";

export type TerminalDock = "bottom" | "tab" | "right" | "left";

export interface TerminalInstance {
  id: string;
  title: string;
  cwd: string;
  dock: TerminalDock;
}

export const terminalInstances = writable<TerminalInstance[]>([]);
export const activeTerminalId = writable<string | null>(null);
export const terminalVisible = writable(false);
export const terminalHeight = writable(250);
export const rightPanelWidth = writable(400);

// Derived: terminals grouped by dock position
export const bottomTerminals = derived(terminalInstances, ($t) =>
  $t.filter((t) => t.dock === "bottom")
);
export const tabTerminals = derived(terminalInstances, ($t) =>
  $t.filter((t) => t.dock === "tab")
);
export const rightTerminals = derived(terminalInstances, ($t) =>
  $t.filter((t) => t.dock === "right")
);
export const rightPanelVisible = derived(rightTerminals, ($t) => $t.length > 0);
export const activeRightTerminalId = writable<string | null>(null);
export const leftTerminals = derived(terminalInstances, ($t) =>
  $t.filter((t) => t.dock === "left")
);
export const leftPanelVisible = derived(leftTerminals, ($t) => $t.length > 0);
export const activeLeftTerminalId = writable<string | null>(null);
export const leftPanelWidth = writable(400);

export function addTerminal(cwd: string, dock: TerminalDock = "bottom"): string {
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const count = get(terminalInstances).length + 1;
  const title = `Terminal ${count}`;

  terminalInstances.update((t) => [...t, { id, title, cwd, dock }]);

  if (dock === "bottom") {
    activeTerminalId.set(id);
    terminalVisible.set(true);
  } else if (dock === "right") {
    activeRightTerminalId.set(id);
  } else if (dock === "left") {
    activeLeftTerminalId.set(id);
  }

  return id;
}

export function removeTerminal(id: string) {
  const instances = get(terminalInstances);
  const inst = instances.find((t) => t.id === id);
  const idx = instances.findIndex((t) => t.id === id);
  terminalInstances.update((t) => t.filter((term) => term.id !== id));

  if (!inst) return;

  if (inst.dock === "bottom" && get(activeTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "bottom");
    if (remaining.length > 0) {
      const newIdx = Math.min(idx, remaining.length - 1);
      activeTerminalId.set(remaining[newIdx].id);
    } else {
      activeTerminalId.set(null);
      terminalVisible.set(false);
    }
  } else if (inst.dock === "right" && get(activeRightTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "right");
    if (remaining.length > 0) {
      activeRightTerminalId.set(remaining[0].id);
    } else {
      activeRightTerminalId.set(null);
    }
  } else if (inst.dock === "left" && get(activeLeftTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "left");
    if (remaining.length > 0) {
      activeLeftTerminalId.set(remaining[0].id);
    } else {
      activeLeftTerminalId.set(null);
    }
  }
}

export function moveTerminal(id: string, newDock: TerminalDock) {
  const instances = get(terminalInstances);
  const inst = instances.find((t) => t.id === id);
  if (!inst || inst.dock === newDock) return;

  const oldDock = inst.dock;

  // If leaving "tab" dock, close the document tab
  if (oldDock === "tab") {
    closeTerminalTab(id);
  }

  // Update the dock position
  terminalInstances.update((t) =>
    t.map((term) => (term.id === id ? { ...term, dock: newDock } : term))
  );

  // Handle active state for old dock
  if (oldDock === "bottom" && get(activeTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "bottom");
    if (remaining.length > 0) {
      activeTerminalId.set(remaining[0].id);
    } else {
      activeTerminalId.set(null);
    }
  } else if (oldDock === "right" && get(activeRightTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "right");
    if (remaining.length > 0) {
      activeRightTerminalId.set(remaining[0].id);
    } else {
      activeRightTerminalId.set(null);
    }
  } else if (oldDock === "left" && get(activeLeftTerminalId) === id) {
    const remaining = instances.filter((t) => t.id !== id && t.dock === "left");
    if (remaining.length > 0) {
      activeLeftTerminalId.set(remaining[0].id);
    } else {
      activeLeftTerminalId.set(null);
    }
  }

  // Set active state for new dock
  if (newDock === "bottom") {
    activeTerminalId.set(id);
    terminalVisible.set(true);
  } else if (newDock === "right") {
    activeRightTerminalId.set(id);
  } else if (newDock === "left") {
    activeLeftTerminalId.set(id);
  } else if (newDock === "tab") {
    openTerminalTab(id, inst.title);
  }
}
