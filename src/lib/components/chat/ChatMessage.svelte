<script lang="ts">
  import type { UIMessage } from '$lib/stores/chat';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    message: UIMessage;
  }

  let { message }: Props = $props();
  let renderedHtml = $state('');

  $effect(() => {
    if (message.role === 'assistant' && !message.isStreaming && message.content) {
      renderMarkdown(message.content).then(html => {
        renderedHtml = html;
      });
    }
  });

  const isUser = $derived(message.role === 'user');
</script>

<div class="group px-4 py-3.5 transition-colors {isUser ? 'bg-bg-hover/20' : ''} hover:bg-bg-hover/15">
  <div class="flex gap-3.5 max-w-full">
    <!-- Avatar -->
    <div class="shrink-0 mt-0.5">
      {#if isUser}
        <div class="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent/70">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      {:else}
        <div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent/80">
            <path d="M12 2L9 12l-7 4 7 4 3 10 3-10 7-4-7-4z"/>
          </svg>
        </div>
      {/if}
    </div>

    <!-- Content -->
    <div class="min-w-0 flex-1 overflow-hidden">
      <!-- Role label -->
      <div class="font-semibold uppercase tracking-wider mb-1.5
        {isUser ? 'text-accent/50' : 'text-text-muted/60'}"
        style="font-size: calc(13px * var(--ui-zoom));">
        {isUser ? 'You' : 'Assistant'}
      </div>

      <!-- Message body -->
      <div class="leading-[1.7] text-text-primary" style="font-size: calc(17px * var(--ui-zoom));">
        {#if message.mentions && message.mentions.length > 0}
          <div class="mb-1.5 flex flex-wrap gap-1.5">
            {#each message.mentions as mention}
              <span class="px-2 py-0.5 rounded bg-accent/15 border border-accent/25 text-accent/85 font-mono" style="font-size: calc(13px * var(--ui-zoom));">@{mention}</span>
            {/each}
          </div>
        {/if}
        {#if message.steer}
          <div class="mb-1.5 text-warning/90" style="font-size: calc(13px * var(--ui-zoom));">Steer: {message.steer}</div>
        {/if}
        {#if isUser}
          <div class="whitespace-pre-wrap break-words">{message.content}</div>
        {:else if message.isStreaming}
          <div class="whitespace-pre-wrap break-words">{message.content}{#if !message.content && message.toolCalls.length === 0}<span class="inline-block w-1.5 h-[15px] bg-accent/60 rounded-sm animate-pulse ml-0.5 translate-y-[2px]"></span>{/if}</div>
        {:else if renderedHtml}
          <div class="chat-prose">{@html renderedHtml}</div>
        {:else}
          <div class="whitespace-pre-wrap break-words">{message.content}</div>
        {/if}
      </div>

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
</div>

<style>
  /* Chat-specific prose overrides - tighter than full markdown view */
  .chat-prose :global(p) {
    margin: 0.35rem 0;
  }
  .chat-prose :global(p:first-child) {
    margin-top: 0;
  }
  .chat-prose :global(p:last-child) {
    margin-bottom: 0;
  }
  .chat-prose :global(pre) {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    overflow-x: auto;
    font-size: 0.85em;
  }
  .chat-prose :global(code) {
    font-family: "Cascadia Code", "Fira Code", monospace;
    background: var(--color-bg-secondary);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .chat-prose :global(pre code) {
    background: none;
    padding: 0;
  }
  .chat-prose :global(a) {
    color: var(--color-accent);
    text-decoration: none;
  }
  .chat-prose :global(a:hover) {
    text-decoration: underline;
  }
  .chat-prose :global(ul), .chat-prose :global(ol) {
    padding-left: 1.25rem;
    margin: 0.35rem 0;
  }
  .chat-prose :global(li) {
    margin: 0.15rem 0;
  }
  .chat-prose :global(blockquote) {
    border-left: 3px solid var(--color-accent);
    padding: 0.25rem 0.75rem;
    margin: 0.5rem 0;
    color: var(--color-text-secondary);
  }
  .chat-prose :global(h1), .chat-prose :global(h2), .chat-prose :global(h3) {
    font-weight: 600;
    margin: 0.75rem 0 0.35rem;
    color: var(--color-text-primary);
  }
  .chat-prose :global(h1) { font-size: 1.15em; }
  .chat-prose :global(h2) { font-size: 1.05em; }
  .chat-prose :global(h3) { font-size: 1em; }
  .chat-prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
    font-size: 0.9em;
  }
  .chat-prose :global(th), .chat-prose :global(td) {
    border: 1px solid var(--color-border);
    padding: 0.35rem 0.5rem;
  }
  .chat-prose :global(th) {
    background: var(--color-bg-secondary);
    font-weight: 600;
  }
  .chat-prose :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0.75rem 0;
  }
  .chat-prose :global(strong) {
    font-weight: 600;
    color: var(--color-text-primary);
  }
</style>
