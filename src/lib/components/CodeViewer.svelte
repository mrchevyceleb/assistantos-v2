<script lang="ts">
  import { getLanguageFromExt } from "$lib/utils/file-types";

  interface Props {
    content: string;
    ext?: string;
  }

  let { content, ext }: Props = $props();

  const lines = $derived(content.split("\n"));
  const language = $derived(getLanguageFromExt(ext));
</script>

<div class="h-full overflow-auto bg-bg-primary">
  <div class="p-4">
    <pre class="text-sm font-mono leading-relaxed"><code>{#each lines as line, i}<span class="inline-block w-12 text-right pr-4 text-text-muted select-none">{i + 1}</span><span class="text-text-primary">{line}</span>
{/each}</code></pre>
  </div>
</div>
