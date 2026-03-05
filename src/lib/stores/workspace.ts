import { writable, derived } from "svelte/store";
import type { FileNode } from "$lib/utils/tauri";

export const workspacePath = writable<string | null>(null);
export const workspaceName = writable<string>("AssistantOS");
export const fileTree = writable<FileNode | null>(null);
export const isLoadingTree = writable(false);
export const sidebarWidth = writable(340);
export const sidebarVisible = writable(true);

// Expanded paths for file tree persistence
export const expandedPaths = writable<Set<string>>(new Set());

export function toggleExpanded(path: string) {
  expandedPaths.update(set => {
    const next = new Set(set);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });
}

export function setExpanded(path: string, expanded: boolean) {
  expandedPaths.update(set => {
    const next = new Set(set);
    if (expanded) next.add(path);
    else next.delete(path);
    return next;
  });
}

export function collapseAll() {
  expandedPaths.set(new Set());
}
