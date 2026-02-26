<script lang="ts">
  import { readFileBinary } from "$lib/utils/tauri";
  import { getMimeType } from "$lib/utils/file-types";

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
      const blob = new Blob([new Uint8Array(bytes)], { type: getMimeType(path) });
      url = URL.createObjectURL(blob);
      blobUrl = url;
    }).catch((e) => {
      if (cancelled) return;
      loadError = true;
      console.error("Failed to load video:", path, e);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<div class="h-full flex items-center justify-center bg-bg-tertiary p-4">
  {#if blobUrl}
    <video
      src={blobUrl}
      controls
      class="max-w-full max-h-full rounded-lg"
    >
      <track kind="captions" />
    </video>
  {:else if loadError}
    <span class="text-error text-sm">Failed to load video</span>
  {:else}
    <span class="text-text-muted text-sm">Loading video...</span>
  {/if}
</div>
