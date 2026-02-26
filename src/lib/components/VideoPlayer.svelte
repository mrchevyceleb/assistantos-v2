<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface Props {
    filePath: string;
  }

  let { filePath }: Props = $props();
  const src = $derived(convertFileSrc(filePath));
</script>

<div class="h-full flex items-center justify-center bg-bg-tertiary p-4">
  <video
    {src}
    controls
    class="max-w-full max-h-full rounded-lg"
  >
    <track kind="captions" />
  </video>
</div>
