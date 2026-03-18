<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  let { children } = $props();

  const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  // Global navigation guard: intercept ALL <a> clicks with external URLs
  // and open them in the system browser instead of navigating the webview.
  onMount(() => {
    function handleGlobalClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Only intercept http/https links (external URLs)
      if (href.startsWith("http://") || href.startsWith("https://")) {
        e.preventDefault();
        e.stopPropagation();
        import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
          openUrl(href).catch((err: unknown) => console.error("Failed to open URL:", err));
        });
      }
    }

    // Capture phase so we catch it before any component handlers
    document.addEventListener("click", handleGlobalClick, true);
    // Also catch middle-click (auxclick) which fires instead of click for button 1
    document.addEventListener("auxclick", handleGlobalClick, true);
    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
      document.removeEventListener("auxclick", handleGlobalClick, true);
    };
  });
</script>

{#if isMac}
  <!-- macOS: no transparent wrapper needed, native window has rounded corners -->
  <div class="h-screen w-screen overflow-hidden" style="background: var(--color-bg-primary);">
    {@render children()}
  </div>
{:else}
  <!-- Windows: transparent wrapper with padding for rounded floating window effect -->
  <div class="h-screen w-screen overflow-hidden" style="padding: 8px; background: transparent;">
    <div class="h-full w-full rounded-xl overflow-hidden glow-border-strong" style="background: var(--color-bg-primary);">
      {@render children()}
    </div>
  </div>
{/if}
