<script lang="ts">
  import type { UIMessage } from '$lib/stores/chat';
  import { settings } from '$lib/stores/settings';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { handleCtrlClick } from '$lib/utils/link-handler';

  const chatFs = $derived($settings.aiChatFontSize);

  const FONT_MAP: Record<string, string> = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    inter: '"Inter", -apple-system, sans-serif',
    jetbrains: '"JetBrains Mono", "Cascadia Code", monospace',
    cascadia: '"Cascadia Code", "Fira Code", monospace',
    fira: '"Fira Code", "JetBrains Mono", monospace',
  };
  const chatFont = $derived(FONT_MAP[$settings.aiChatFontFamily] || FONT_MAP.system);

  interface Props {
    message: UIMessage;
  }

  let { message }: Props = $props();
  let renderedHtml = $state('');
  let showFullThinking = $state(false);

  $effect(() => {
    if (message.role === 'assistant' && !message.isStreaming && message.content) {
      renderMarkdown(message.content).then(html => {
        renderedHtml = html;
      });
    }
  });

  const isUser = $derived(message.role === 'user');
  const thinkingText = $derived((message.thinking || '').trim());

  function firstSentences(text: string, maxSentences = 3): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    const parts = normalized.split(/(?<=[.!?])\s+/);
    if (parts.length <= maxSentences) return normalized;
    return parts.slice(0, maxSentences).join(' ');
  }

  const thinkingPreview = $derived(firstSentences(thinkingText));
  const thinkingHidden = $derived(thinkingText.length > thinkingPreview.length);

  let messageBodyEl: HTMLDivElement;

  function onMessageClick(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      handleCtrlClick(e, messageBodyEl);
    }
  }
</script>

<div class="group transition-colors {isUser ? 'bg-bg-hover/20' : ''} hover:bg-bg-hover/15" style="padding: 20px 32px 20px 24px;">
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
      <div class="font-semibold uppercase tracking-wider"
        style="font-size: {chatFs - 3}px; margin-bottom: 8px; color: {message.role === 'system' ? 'rgb(234, 179, 8)' : isUser ? 'var(--color-accent)' : 'rgb(34, 197, 94)'};">
        {message.role === 'system' ? 'System' : isUser ? 'You' : 'Assistant'}
      </div>

      <!-- Message body -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="leading-[1.75] text-text-primary select-text"
        style="font-size: {chatFs}px; font-family: {chatFont}; -webkit-font-smoothing: antialiased;"
        bind:this={messageBodyEl}
        onclick={onMessageClick}
      >
        {#if !isUser && thinkingText && $settings.aiThinkingMode !== 'none'}
          <div class="mb-3 rounded-lg border border-accent/20 bg-accent/6 px-4 py-3">
            <div class="mb-1.5 text-text-muted uppercase tracking-wider" style="font-size: {chatFs - 4}px;">Thinking</div>
            {#if $settings.aiThinkingMode === 'all'}
              <div class="whitespace-pre-wrap break-words text-text-secondary" style="font-size: {chatFs - 2}px;">{thinkingText}</div>
            {:else}
              <div class="whitespace-pre-wrap break-words text-text-secondary" style="font-size: {chatFs - 2}px;">
                {showFullThinking ? thinkingText : thinkingPreview}
              </div>
              {#if thinkingHidden}
                <button
                  class="mt-1.5 text-accent/85 hover:text-accent transition-colors"
                  style="font-size: {chatFs - 3}px;"
                  onclick={() => (showFullThinking = !showFullThinking)}
                >
                  {showFullThinking ? 'Hide full thinking' : 'Show full thinking'}
                </button>
              {/if}
            {/if}
          </div>
        {/if}

        {#if message.mentions && message.mentions.length > 0}
          <div class="mb-2 flex flex-wrap gap-1.5">
            {#each message.mentions as mention}
              <span class="px-2 py-0.5 rounded bg-accent/15 border border-accent/25 text-accent/85 font-mono" style="font-size: {chatFs - 2}px;">@{mention}</span>
            {/each}
          </div>
        {/if}
        {#if message.steer}
          <div class="mb-2 text-warning/90" style="font-size: {chatFs - 2}px;">Steer: {message.steer}</div>
        {/if}
        {#if message.images && message.images.length > 0}
          <div class="mb-2 flex flex-wrap gap-2">
            {#each message.images as img}
              <img
                src="data:{img.mediaType};base64,{img.base64}"
                alt="Attached screenshot"
                class="max-w-[300px] max-h-[240px] object-contain rounded-lg border border-border/30"
              />
            {/each}
          </div>
        {/if}
        {#if isUser}
          <div class="whitespace-pre-wrap break-words">{message.content}</div>
        {:else if message.isStreaming}
          <div class="whitespace-pre-wrap break-words">
            {message.content}
            {#if message.toolCalls.length === 0}
              {#if message.content}
                <span class="thinking-trail" aria-hidden="true">
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                </span>
              {:else}
                <span class="thinking-chip" role="status" aria-label="Assistant is working">
                  <span class="thinking-orbit" aria-hidden="true">
                    <span class="thinking-core"></span>
                  </span>
                  <span class="thinking-label">Thinking</span>
                  <span class="thinking-ellipsis" aria-hidden="true">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                </span>
              {/if}
            {/if}
          </div>
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
    color: var(--color-accent);
  }
  .chat-prose :global(pre code) {
    background: none;
    padding: 0;
  }
  .chat-prose :global(a) {
    color: var(--color-accent);
    text-decoration: none;
    cursor: pointer;
  }
  .chat-prose :global(a:hover) {
    text-decoration: underline;
  }
  /* Ctrl+Click hint for code blocks containing file paths */
  .chat-prose :global(code:hover) {
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .chat-prose :global(ul), .chat-prose :global(ol) {
    padding-left: 1.25rem;
    margin: 0.35rem 0;
  }
  .chat-prose :global(li) {
    margin: 0.15rem 0;
  }
  .chat-prose :global(blockquote) {
    border-left: 3px solid rgb(34, 197, 94);
    padding: 0.25rem 0.75rem;
    margin: 0.5rem 0;
    color: var(--color-text-secondary);
  }
  .chat-prose :global(h1), .chat-prose :global(h2), .chat-prose :global(h3), .chat-prose :global(h4) {
    font-weight: 600;
    margin: 0.75rem 0 0.35rem;
    color: var(--color-accent);
  }
  .chat-prose :global(h1) { font-size: 1.2em; }
  .chat-prose :global(h2) { font-size: 1.1em; }
  .chat-prose :global(h3) { font-size: 1.02em; color: rgb(34, 197, 94); }
  .chat-prose :global(h4) { font-size: 0.95em; color: var(--color-text-primary); }
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
    color: rgb(248, 250, 252);
  }
  .chat-prose :global(em) {
    color: var(--color-text-secondary);
    font-style: italic;
  }
  .chat-prose :global(li::marker) {
    color: var(--color-accent);
  }

  .thinking-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid rgba(88, 180, 208, 0.28);
    border-radius: 999px;
    background: rgba(88, 180, 208, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .thinking-orbit {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(88, 180, 208, 0.25);
    border-top-color: rgba(88, 180, 208, 0.95);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: thinking-spin 0.9s linear infinite;
  }

  .thinking-core {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: rgba(88, 180, 208, 0.95);
    box-shadow: 0 0 10px rgba(88, 180, 208, 0.45);
  }

  .thinking-label {
    font-size: 0.82em;
    color: var(--color-text-secondary);
    letter-spacing: 0.02em;
  }

  .thinking-ellipsis span {
    color: rgba(88, 180, 208, 0.9);
    animation: thinking-blink 1.1s infinite;
  }

  .thinking-ellipsis span:nth-child(2) {
    animation-delay: 0.18s;
  }

  .thinking-ellipsis span:nth-child(3) {
    animation-delay: 0.36s;
  }

  .thinking-trail {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    vertical-align: middle;
  }

  .thinking-trail-dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: rgba(88, 180, 208, 0.85);
    animation: thinking-hop 0.9s ease-in-out infinite;
  }

  .thinking-trail-dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .thinking-trail-dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes thinking-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes thinking-blink {
    0%,
    80%,
    100% {
      opacity: 0.25;
    }
    40% {
      opacity: 1;
    }
  }

  @keyframes thinking-hop {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    50% {
      transform: translateY(-2px);
      opacity: 1;
    }
  }
</style>
