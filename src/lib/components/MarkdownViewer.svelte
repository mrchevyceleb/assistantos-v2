<script lang="ts">
  import { renderMarkdown } from "$lib/utils/markdown";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { onMount } from "svelte";

  interface Props {
    content: string;
    filePath: string;
  }

  let { content, filePath }: Props = $props();
  let renderedHtml = $state("");
  let container: HTMLDivElement;

  /** Get the directory containing the current file */
  function getFileDir(fp: string): string {
    const sep = fp.includes("\\") ? "\\" : "/";
    const parts = fp.split(sep);
    parts.pop();
    return parts.join(sep);
  }

  /** Resolve relative image/link paths to absolute and convert to Tauri asset URLs */
  function resolveLocalPaths(html: string): string {
    const dir = getFileDir(filePath);
    const sep = filePath.includes("\\") ? "\\" : "/";

    // Fix img src attributes — convert local paths to asset:// URLs
    return html.replace(
      /(<img\s[^>]*?src=")([^"]+?)(")/gi,
      (_match, prefix, src, suffix) => {
        // Skip already-absolute URLs (http, https, data, asset, blob)
        if (/^(https?:|data:|asset:|blob:|\/\/)/i.test(src)) {
          return prefix + src + suffix;
        }
        // Build absolute path from relative
        let absPath: string;
        if (src.startsWith("/") || /^[A-Z]:\\/i.test(src)) {
          absPath = src; // already absolute
        } else {
          absPath = dir + sep + src.replace(/\//g, sep);
        }
        const assetUrl = convertFileSrc(absPath);
        return prefix + assetUrl + suffix;
      }
    );
  }

  async function render() {
    try {
      let html = await renderMarkdown(content);
      html = resolveLocalPaths(html);
      renderedHtml = html;
    } catch (e) {
      console.error("Failed to render markdown:", e);
      renderedHtml = `<pre>${content}</pre>`;
    }
  }

  $effect(() => {
    content; // track dependency
    filePath; // also re-render if file changes
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
