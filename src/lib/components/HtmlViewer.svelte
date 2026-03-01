<script lang="ts">
  import CodeViewer from "./CodeViewer.svelte";

  interface Props {
    content: string;
    filePath: string;
  }

  let { content, filePath }: Props = $props();
  let showPreview = $state(false);
  let iframeEl = $state<HTMLIFrameElement | null>(null);

  function togglePreview() {
    showPreview = !showPreview;
  }

  $effect(() => {
    if (showPreview && iframeEl) {
      // Use srcdoc for sandboxed preview
      iframeEl.srcdoc = content;
    }
  });
</script>

<div class="h-full flex flex-col">
  <!-- Toolbar -->
  <div class="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border">
    <button
      class="text-xs px-2 py-1 rounded transition-colors"
      class:bg-accent={!showPreview}
      class:text-bg-primary={!showPreview}
      class:text-text-muted={showPreview}
      class:hover:text-text-primary={showPreview}
      onclick={() => showPreview = false}
    >
      Source
    </button>
    <button
      class="text-xs px-2 py-1 rounded transition-colors"
      class:bg-accent={showPreview}
      class:text-bg-primary={showPreview}
      class:text-text-muted={!showPreview}
      class:hover:text-text-primary={!showPreview}
      onclick={() => showPreview = true}
    >
      Preview
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden">
    {#if showPreview}
      <iframe
        bind:this={iframeEl}
        class="w-full h-full border-none bg-white"
        style="transform: scale(var(--content-zoom)); transform-origin: top left; width: calc(100% / var(--content-zoom)); height: calc(100% / var(--content-zoom));"
        title="HTML Preview"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    {:else}
      <CodeViewer {content} ext="html" />
    {/if}
  </div>
</div>
