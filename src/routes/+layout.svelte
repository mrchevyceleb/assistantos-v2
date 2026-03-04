<script>
  import "../app.css";
  let { children } = $props();

  const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
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
