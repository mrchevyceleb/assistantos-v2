<script>
  import "../app.css";
  let { children } = $props();
</script>

<div class="h-screen w-screen overflow-hidden p-2" style="background: transparent;">
  <div class="h-full w-full rounded-xl overflow-hidden glow-border-strong" style="background: var(--color-bg-primary);">
    {@render children()}
  </div>
</div>
