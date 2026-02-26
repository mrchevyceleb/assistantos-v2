<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { formatFileSize } from "$lib/utils/file-types";

  interface Props {
    filePath: string;
    fileSize?: number;
  }

  let { filePath, fileSize }: Props = $props();

  const src = $derived(convertFileSrc(filePath));
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let scale = $state(1);

  function handleLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
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
  <div class="flex items-center gap-3 px-3 py-1.5 bg-bg-secondary border-b border-border text-xs text-text-muted">
    {#if naturalWidth}
      <span>{naturalWidth} x {naturalHeight}</span>
    {/if}
    {#if fileSize}
      <span>{formatFileSize(fileSize)}</span>
    {/if}
    <span>{Math.round(scale * 100)}%</span>
    <button onclick={resetZoom} class="text-accent hover:text-accent-hover ml-1">Reset</button>
  </div>

  <!-- Image -->
  <div
    class="flex-1 overflow-auto flex items-center justify-center"
    style="background: repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 50% / 20px 20px;"
    onwheel={handleWheel}
  >
    <img
      {src}
      alt={filePath.split(/[/\\]/).pop() || ""}
      class="max-w-none transition-transform duration-100"
      style:transform="scale({scale})"
      onload={handleLoad}
    />
  </div>
</div>
