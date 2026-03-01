<script lang="ts">
  import { readFileBinary } from "$lib/utils/tauri";
  import { formatFileSize, getMimeType } from "$lib/utils/file-types";

  interface Props {
    filePath: string;
    fileSize?: number;
  }

  let { filePath, fileSize }: Props = $props();

  let blobUrl = $state<string | null>(null);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let scale = $state(1);
  let loadError = $state(false);

  $effect(() => {
    const path = filePath;
    let cancelled = false;
    let url: string | null = null;

    blobUrl = null;
    loadError = false;

    readFileBinary(path).then((bytes) => {
      if (cancelled) return;
      const blob = new Blob([new Uint8Array(bytes)], { type: getMimeType(path) });
      url = URL.createObjectURL(blob);
      blobUrl = url;
    }).catch((e) => {
      if (cancelled) return;
      loadError = true;
      console.error("Failed to load image:", path, e);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  function handleLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
    loadError = false;
  }

  function handleError() {
    loadError = true;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.max(0.1, Math.min(5, scale + delta));
  }

  function resetZoom() {
    scale = 1;
  }
</script>

<div class="h-full flex flex-col">
  <!-- Info bar -->
  <div class="flex items-center gap-4 px-4 py-2 bg-bg-secondary border-b border-border text-sm text-text-muted">
    {#if naturalWidth}
      <span>{naturalWidth} x {naturalHeight}</span>
    {/if}
    {#if fileSize}
      <span>{formatFileSize(fileSize)}</span>
    {/if}
    <span>{Math.round(scale * 100)}%</span>
    <button onclick={resetZoom} class="text-accent hover:text-accent-hover ml-1">Reset</button>
    {#if loadError}
      <span class="text-error">Failed to load</span>
    {/if}
  </div>

  <!-- Image -->
  <div
    class="flex-1 overflow-auto flex items-center justify-center"
    style="background: repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 50% / 20px 20px;"
    onwheel={handleWheel}
  >
    {#if blobUrl}
      <img
        src={blobUrl}
        alt={filePath.split(/[/\\]/).pop() || ""}
        class="max-w-none transition-transform duration-100"
        style="transform: scale(calc(${scale} * var(--content-zoom)));"
        onload={handleLoad}
        onerror={handleError}
      />
    {:else if !loadError}
      <span class="text-text-muted text-sm">Loading...</span>
    {/if}
  </div>
</div>
