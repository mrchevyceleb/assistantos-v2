<script lang="ts">
  import { readFileBinary } from "$lib/utils/tauri";

  interface Props {
    filePath: string;
  }

  let { filePath }: Props = $props();
  let blobUrl = $state<string | null>(null);
  let loadError = $state(false);

  $effect(() => {
    const path = filePath;
    let cancelled = false;
    let url: string | null = null;

    blobUrl = null;
    loadError = false;

    readFileBinary(path).then((bytes) => {
      if (cancelled) return;
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      url = URL.createObjectURL(blob);
      blobUrl = url;
    }).catch((e) => {
      if (cancelled) return;
      loadError = true;
      console.error("Failed to load PDF:", path, e);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<div class="h-full flex flex-col items-center justify-center bg-bg-tertiary">
  {#if blobUrl}
    <iframe
      src="{blobUrl}#view=FitH"
      class="w-full h-full border-none"
      style="transform: scale(var(--content-zoom)); transform-origin: top left; width: calc(100% / var(--content-zoom)); height: calc(100% / var(--content-zoom));"
      title="PDF Viewer"
    ></iframe>
  {:else if loadError}
    <span class="text-error text-sm">Failed to load PDF</span>
  {:else}
    <span class="text-text-muted text-sm">Loading PDF...</span>
  {/if}
</div>
