<script lang="ts">
  import type { UIToolCall } from '$lib/stores/chat';

  interface Props {
    toolCall: UIToolCall;
  }

  let { toolCall }: Props = $props();
  let expanded = $state(false);

  const statusColors: Record<UIToolCall['status'], string> = {
    running: 'text-yellow-400',
    success: 'text-green-400',
    error: 'text-red-400',
  };

  const statusIcons: Record<UIToolCall['status'], string> = {
    running: '⟳',
    success: '✓',
    error: '✗',
  };
</script>

<div class="rounded-lg border {toolCall.isError ? 'border-red-500/30 bg-red-500/5' : 'border-border/30 bg-bg-tertiary/50'} text-xs overflow-hidden">
  <!-- Header -->
  <button
    class="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-hover/50 transition-colors text-left"
    onclick={() => expanded = !expanded}
  >
    <span class="{statusColors[toolCall.status]} text-xs {toolCall.status === 'running' ? 'animate-spin' : ''}">{statusIcons[toolCall.status]}</span>
    <span class="text-text-secondary font-mono">{toolCall.name}</span>
    <span class="flex-1"></span>
    <span class="text-text-muted text-[10px]">{expanded ? '▼' : '▶'}</span>
  </button>

  <!-- Expandable body -->
  {#if expanded}
    <div class="px-2.5 py-2 border-t border-border/20 space-y-2">
      {#if toolCall.arguments}
        <div>
          <div class="text-text-muted text-[10px] uppercase mb-0.5">Arguments</div>
          <pre class="text-text-secondary font-mono text-[11px] whitespace-pre-wrap break-all max-h-32 overflow-auto">{(() => {
            try { return JSON.stringify(JSON.parse(toolCall.arguments), null, 2); }
            catch { return toolCall.arguments; }
          })()}</pre>
        </div>
      {/if}
      {#if toolCall.result}
        <div>
          <div class="text-text-muted text-[10px] uppercase mb-0.5">Result</div>
          <pre class="text-text-secondary font-mono text-[11px] whitespace-pre-wrap break-all max-h-48 overflow-auto">{toolCall.result}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
