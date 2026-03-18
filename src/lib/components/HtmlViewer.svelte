<script lang="ts">
  import { onMount } from "svelte";
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

  // Script injected into iframe srcdoc to intercept link clicks
  // and post them to the parent window instead of navigating.
  const LINK_INTERCEPT_SCRIPT = `<script>
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (a && a.href && (a.href.startsWith('http://') || a.href.startsWith('https://'))) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ type: 'open-external-url', url: a.href }, '*');
      }
    }, true);
  <\/script>`;

  $effect(() => {
    if (showPreview && iframeEl) {
      // Inject link interceptor into the HTML content
      iframeEl.srcdoc = content + LINK_INTERCEPT_SCRIPT;
    }
  });

  // Listen for messages from the iframe to open external URLs
  onMount(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'open-external-url' && typeof e.data.url === 'string') {
        import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
          openUrl(e.data.url).catch((err: unknown) => console.error('Failed to open URL:', err));
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
