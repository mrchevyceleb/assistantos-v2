import { writable, get } from "svelte/store";

// ── UI Zoom ──────────────────────────────────────────────────────────

export const uiZoom = writable(1.0);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.1;

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
  document.documentElement.style.setProperty("--ui-zoom", String(level));

  // Non-terminal viewers need a stronger response than global chrome zoom.
  const contentZoom = level >= 1
    ? 1 + (level - 1) * 1.35
    : 1 - (1 - level) * 0.9;
  document.documentElement.style.setProperty("--content-zoom", String(Number(contentZoom.toFixed(3))));
}

/** Call on startup to apply persisted zoom level */
export function initZoom() {
  const level = get(uiZoom);
  applyZoom(level);
}
