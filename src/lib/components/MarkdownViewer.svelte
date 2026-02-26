<script lang="ts">
  import { renderMarkdown } from "$lib/utils/markdown";
  import { onMount } from "svelte";

  interface Props {
    content: string;
    filePath: string;
  }

  let { content, filePath }: Props = $props();
  let renderedHtml = $state("");
  let container: HTMLDivElement;

  async function render() {
    try {
      renderedHtml = await renderMarkdown(content);
    } catch (e) {
      console.error("Failed to render markdown:", e);
      renderedHtml = `<pre>${content}</pre>`;
    }
  }

  $effect(() => {
    content; // track dependency
    render();
  });

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        e.preventDefault();
        // Open external links in default browser
        import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
          openUrl(href);
        });
      }
    }
  }
</script>

<div
  class="h-full overflow-y-auto"
  bind:this={container}
  onclick={handleClick}
>
  <div class="markdown-body">
    {@html renderedHtml}
  </div>
</div>
