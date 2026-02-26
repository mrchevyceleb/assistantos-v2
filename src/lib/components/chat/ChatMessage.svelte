<script lang="ts">
  import type { UIMessage } from '$lib/stores/chat';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    message: UIMessage;
  }

  let { message }: Props = $props();
  let renderedHtml = $state('');

  // Render markdown for finalized assistant messages
  $effect(() => {
    if (message.role === 'assistant' && !message.isStreaming && message.content) {
      renderMarkdown(message.content).then(html => {
        renderedHtml = html;
      });
    }
  });
</script>

<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
  <div class="max-w-[85%] {message.role === 'user'
    ? 'bg-accent/15 border border-accent/20 text-text-primary'
    : 'bg-bg-secondary/80 border border-border/30 text-text-primary'} rounded-xl px-3.5 py-2.5 text-sm">

    {#if message.role === 'user'}
      <div class="whitespace-pre-wrap">{message.content}</div>
    {:else if message.isStreaming}
      <div class="whitespace-pre-wrap">{message.content}{#if !message.content && message.toolCalls.length === 0}<span class="inline-block w-2 h-4 bg-accent/60 animate-pulse"></span>{/if}</div>
    {:else if renderedHtml}
      <div class="prose prose-invert prose-sm max-w-none [&_pre]:bg-bg-tertiary [&_pre]:border [&_pre]:border-border/30 [&_pre]:rounded-lg [&_code]:text-accent/80 [&_a]:text-accent">{@html renderedHtml}</div>
    {:else}
      <div class="whitespace-pre-wrap">{message.content}</div>
    {/if}

    <!-- Tool calls -->
    {#if message.toolCalls.length > 0}
      <div class="mt-2 space-y-1.5">
        {#each message.toolCalls as toolCall (toolCall.id)}
          <ToolCallBlock {toolCall} />
        {/each}
      </div>
    {/if}
  </div>
</div>
