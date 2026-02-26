import { writable, derived } from "svelte/store";
import type { FileNode } from "$lib/utils/tauri";

export const workspacePath = writable<string | null>(null);
export const workspaceName = writable<string>("AssistantOS");
export const fileTree = writable<FileNode | null>(null);
export const isLoadingTree = writable(false);
export const sidebarWidth = writable(280);
export const sidebarVisible = writable(true);
