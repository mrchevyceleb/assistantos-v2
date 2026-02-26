import { writable, get } from "svelte/store";

// ── UI Zoom ──────────────────────────────────────────────────────────

export const uiZoom = writable(1.0);

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.05;

export function zoomIn() {
  uiZoom.update((z) => {
    const next = Math.min(MAX_ZOOM, z + ZOOM_STEP);
    applyZoom(next);
    return next;
  });
}

export function zoomOut() {
  uiZoom.update((z) => {
    const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
    applyZoom(next);
    return next;
  });
}

export function resetZoom() {
  uiZoom.set(1.0);
  applyZoom(1.0);
}

const BASE_FONT_SIZE = 14.5;

export function applyZoom(level: number) {
  document.documentElement.style.fontSize = `${level * BASE_FONT_SIZE}px`;
}

/** Call on startup to apply persisted zoom level */
export function initZoom() {
  const level = get(uiZoom);
  applyZoom(level);
}
