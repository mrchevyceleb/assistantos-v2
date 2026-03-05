<script lang="ts">
  import type { UIToolCall } from '$lib/stores/chat';

  interface Props {
    toolCall: UIToolCall;
  }

  let { toolCall }: Props = $props();
  let expanded = $state(false);

  const statusConfig: Record<UIToolCall['status'], { color: string; icon: string; bg: string }> = {
    running: { color: 'text-warning', icon: '...', bg: 'bg-warning/8 border-warning/20' },
    success: { color: 'text-success', icon: '', bg: 'bg-success/6 border-success/15' },
    error: { color: 'text-error', icon: '', bg: 'bg-error/6 border-error/15' },
  };

  const config = $derived(statusConfig[toolCall.status]);
</script>

<div class="rounded-lg border {config.bg} overflow-hidden" style="font-size: calc(13px * var(--ui-zoom)); border-left: 3px solid {toolCall.status === 'running' ? 'var(--color-accent)' : toolCall.status === 'success' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'};">
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-hover/30 transition-colors text-left"
    onclick={() => expanded = !expanded}
  >
    <!-- Status indicator -->
    {#if toolCall.status === 'running'}
      <div class="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
        <div class="w-2 h-2 rounded-full bg-warning/60 animate-pulse"></div>
      </div>
    {:else if toolCall.status === 'success'}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-success shrink-0">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    {:else}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-error shrink-0">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    {/if}

    <span class="text-text-secondary font-mono truncate">{toolCall.name}</span>
    <span class="flex-1"></span>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted/40 shrink-0 transition-transform {expanded ? 'rotate-90' : ''}">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>

  {#if expanded}
    <div class="px-2.5 py-2 border-t border-border/15 space-y-2">
      {#if toolCall.arguments}
        <div>
          <div class="text-text-muted uppercase tracking-wider mb-1 font-medium" style="font-size: calc(11.5px * var(--ui-zoom));">Args</div>
          <pre class="text-text-secondary font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto
            bg-bg-tertiary/50 rounded-md p-2 border border-border/15">{(() => {
            try { return JSON.stringify(JSON.parse(toolCall.arguments), null, 2); }
            catch { return toolCall.arguments; }
          })()}</pre>
        </div>
      {/if}
      {#if toolCall.result}
        <div>
          <div class="text-text-muted uppercase tracking-wider mb-1 font-medium" style="font-size: calc(11.5px * var(--ui-zoom));">Result</div>
          <pre class="text-text-secondary font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto
            bg-bg-tertiary/50 rounded-md p-2 border border-border/15">{toolCall.result}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
