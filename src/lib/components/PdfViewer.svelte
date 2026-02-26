<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface Props {
    filePath: string;
  }

  let { filePath }: Props = $props();
  const src = $derived(convertFileSrc(filePath));
</script>

<div class="h-full flex flex-col items-center justify-center bg-bg-tertiary">
  <iframe
    src="{src}#view=FitH"
    class="w-full h-full border-none"
    title="PDF Viewer"
  ></iframe>
</div>
