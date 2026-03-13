<script lang="ts">
  import type { UIMessage } from '$lib/stores/chat';
  import { settings } from '$lib/stores/settings';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { handleCtrlClick } from '$lib/utils/link-handler';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { openTab, updateTabContent, setTabLoading } from '$lib/stores/tabs';
  import { readFileText, getFileInfo } from '$lib/utils/tauri';
  import { get } from 'svelte/store';
  import { workspacePath } from '$lib/stores/workspace';

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
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRenderedContent = '';
  let isRendering = false;

  // Render markdown both during streaming (debounced) and after completion
  $effect(() => {
    if (message.role !== 'assistant' || !message.content) return;

    if (message.isStreaming) {
      // Debounce rendering during streaming to avoid overwhelming shiki
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        if (!isRendering && message.content !== lastRenderedContent) {
          isRendering = true;
          lastRenderedContent = message.content;
          renderMarkdown(message.content).then(html => {
            renderedHtml = html;
            isRendering = false;
          }).catch(() => { isRendering = false; });
        }
      }, 200);
    } else {
      // Final render on completion
      if (renderTimer) clearTimeout(renderTimer);
      renderMarkdown(message.content).then(html => {
        renderedHtml = html;
        lastRenderedContent = message.content;
      });
    }

    return () => {
      if (renderTimer) clearTimeout(renderTimer);
    };
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

  /** Open a file path in the editor (for link clicks) */
  async function openFileInEditor(rawPath: string): Promise<void> {
    const ws = get(workspacePath);
    let resolved = rawPath;
    if (ws && !/^[A-Za-z]:/.test(rawPath) && !rawPath.startsWith('/')) {
      resolved = rawPath.replace(/^\.[\\/]/, '');
      const sep = ws.includes('\\') ? '\\' : '/';
      resolved = `${ws}${sep}${resolved}`;
    }
    try {
      const info = await getFileInfo(resolved);
      if (!info || info.is_dir) return;
      const name = resolved.split(/[\\/]/).pop() || resolved;
      const ext = name.includes('.') ? name.split('.').pop() || '' : '';
      const tabId = openTab(resolved, name, ext);
      const content = await readFileText(resolved);
      updateTabContent(tabId, content);
    } catch { /* ignore */ }
  }

  /** Check if text looks like a file path */
  function looksLikeFilePath(text: string): boolean {
    const trimmed = text.trim();
    // Windows absolute: C:\... or C:/...
    if (/^[A-Za-z]:[\\\/]/.test(trimmed)) return true;
    // Unix absolute: /home/...
    if (/^\/[a-zA-Z]/.test(trimmed)) return true;
    // Relative with extension: src/lib/foo.ts, ./foo.md
    if (/^\.{0,2}[\\\/]/.test(trimmed) && /\.\w+$/.test(trimmed)) return true;
    // Path-like with slashes and a file extension
    if (/[\\\/]/.test(trimmed) && /\.\w{1,10}$/.test(trimmed)) return true;
    return false;
  }

  function onMessageClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    // Handle copy button clicks on code blocks
    if (target.classList.contains('code-block-copy')) {
      e.preventDefault();
      e.stopPropagation();
      const code = target.getAttribute('data-code') || '';
      const decoded = code
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
      navigator.clipboard.writeText(decoded).then(() => {
        target.textContent = 'Copied!';
        setTimeout(() => { target.textContent = 'Copy'; }, 1500);
      });
      return;
    }

    // Handle <a> tag clicks: always intercept, open in browser or editor
    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (anchor && messageBodyEl?.contains(anchor)) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href) {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          openUrl(href).catch(err => console.error('Failed to open URL:', err));
        } else {
          openFileInEditor(href);
        }
      }
      return;
    }

    // Handle clicks on <code> elements containing file paths (no Ctrl needed)
    const codeEl = target.closest('code') as HTMLElement | null;
    if (codeEl && messageBodyEl?.contains(codeEl) && !codeEl.closest('pre')) {
      const text = codeEl.textContent || '';
      if (looksLikeFilePath(text)) {
        e.preventDefault();
        e.stopPropagation();
        openFileInEditor(text.trim());
        return;
      }
    }

    // Ctrl+Click for plain text URLs/file paths
    if (e.ctrlKey || e.metaKey) {
      handleCtrlClick(e, messageBodyEl);
    }
  }
</script>

<div class="group transition-colors {isUser ? 'bg-bg-hover/20' : ''} hover:bg-bg-hover/15" style="padding: 20px 32px 20px 24px;">
  <div class="flex max-w-full" style="gap: 14px;">
    <!-- Avatar -->
    <div class="shrink-0" style="margin-top: 2px;">
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
          <div class="rounded-lg border border-accent/20 bg-accent/6" style="margin-bottom: 12px; padding: 12px 16px;">
            <div class="text-text-muted uppercase tracking-wider" style="font-size: {chatFs - 4}px; margin-bottom: 6px;">Thinking</div>
            {#if $settings.aiThinkingMode === 'all'}
              <div class="whitespace-pre-wrap break-words text-text-secondary" style="font-size: {chatFs - 2}px;">{thinkingText}</div>
            {:else}
              <div class="whitespace-pre-wrap break-words text-text-secondary" style="font-size: {chatFs - 2}px;">
                {showFullThinking ? thinkingText : thinkingPreview}
              </div>
              {#if thinkingHidden}
                <button
                  class="text-accent/85 hover:text-accent transition-colors"
                  style="margin-top: 6px; font-size: {chatFs - 3}px;"
                  onclick={() => (showFullThinking = !showFullThinking)}
                >
                  {showFullThinking ? 'Hide full thinking' : 'Show full thinking'}
                </button>
              {/if}
            {/if}
          </div>
        {/if}

        {#if message.mentions && message.mentions.length > 0}
          <div class="flex flex-wrap" style="margin-bottom: 8px; gap: 6px;">
            {#each message.mentions as mention}
              <span class="rounded bg-accent/15 border border-accent/25 text-accent/85 font-mono" style="font-size: {chatFs - 2}px; padding: 2px 8px;">@{mention}</span>
            {/each}
          </div>
        {/if}
        {#if message.steer}
          <div class="text-warning/90" style="font-size: {chatFs - 2}px; margin-bottom: 8px;">Steer: {message.steer}</div>
        {/if}
        {#if message.images && message.images.length > 0}
          <div class="flex flex-wrap" style="margin-bottom: 8px; gap: 8px;">
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
          {#if renderedHtml}
            <div class="chat-prose">
              {@html renderedHtml}
              {#if message.toolCalls.length === 0}
                <span class="thinking-trail" aria-hidden="true">
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                </span>
              {/if}
            </div>
          {:else if message.content}
            <div class="whitespace-pre-wrap break-words">
              {message.content}
              {#if message.toolCalls.length === 0}
                <span class="thinking-trail" aria-hidden="true">
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                  <span class="thinking-trail-dot"></span>
                </span>
              {/if}
            </div>
          {:else}
            <div>
              {#if message.toolCalls.length === 0}
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
            </div>
          {/if}
        {:else if renderedHtml}
          <div class="chat-prose">{@html renderedHtml}</div>
        {:else}
          <div class="whitespace-pre-wrap break-words">{message.content}</div>
        {/if}
      </div>

      <!-- Tool calls -->
      {#if message.toolCalls.length > 0}
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
          {#each message.toolCalls as toolCall (toolCall.id)}
            <ToolCallBlock {toolCall} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ── Chat prose: base text ── */
  .chat-prose {
    color: rgba(226, 232, 240, 0.9);
  }
  .chat-prose :global(p) {
    margin: 0.35rem 0;
  }
  .chat-prose :global(p:first-child) {
    margin-top: 0;
  }
  .chat-prose :global(p:last-child) {
    margin-bottom: 0;
  }

  /* ── Code blocks (shiki wrapper) ── */
  .chat-prose :global(.code-block-wrapper) {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    margin: 0.5rem 0;
  }
  .chat-prose :global(.code-block-header) {
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.75em;
  }
  .chat-prose :global(.code-block-lang) {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .chat-prose :global(.code-block-copy) {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.15s ease;
  }
  .chat-prose :global(.code-block-copy:hover) {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }
  .chat-prose :global(pre.shiki) {
    background: var(--color-bg-tertiary) !important;
    border: none;
    border-radius: 0;
    padding: 0.75rem 1rem;
    margin: 0;
    overflow-x: auto;
    font-size: 0.85em;
  }
  /* Fallback for <pre> not wrapped by shiki */
  .chat-prose :global(pre:not(.shiki)) {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    overflow-x: auto;
    font-size: 0.85em;
  }

  /* ── Inline code ── */
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
    color: inherit;
  }
  .chat-prose :global(code:hover) {
    text-decoration: underline;
    text-decoration-style: dotted;
    cursor: pointer;
  }

  /* ── Links ── */
  .chat-prose :global(a) {
    color: var(--color-accent);
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .chat-prose :global(a:hover) {
    text-decoration: underline;
    filter: brightness(1.15);
  }

  /* ── Lists ── */
  .chat-prose :global(ul) {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin: 0.4rem 0;
  }
  .chat-prose :global(ol) {
    list-style-type: decimal;
    padding-left: 1.5rem;
    margin: 0.4rem 0;
  }
  .chat-prose :global(li) {
    margin: 0.3rem 0;
    color: var(--color-text-secondary);
  }
  .chat-prose :global(li::marker) {
    color: var(--color-accent);
    font-weight: 700;
  }
  .chat-prose :global(li > ul), .chat-prose :global(li > ol) {
    margin: 0.15rem 0;
  }
  .chat-prose :global(ul ul) {
    list-style-type: circle;
  }
  .chat-prose :global(ul ul ul) {
    list-style-type: square;
  }

  /* ── Headings ── */
  .chat-prose :global(h1) {
    font-size: 1.35em;
    font-weight: 800;
    margin: 1rem 0 0.4rem;
    color: #ffffff;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.3rem;
    letter-spacing: -0.01em;
  }
  .chat-prose :global(h2) {
    font-size: 1.2em;
    font-weight: 700;
    margin: 0.85rem 0 0.35rem;
    color: var(--color-accent);
  }
  .chat-prose :global(h3) {
    font-size: 1.08em;
    font-weight: 700;
    margin: 0.75rem 0 0.3rem;
    color: rgb(34, 197, 94);
  }
  .chat-prose :global(h4) {
    font-size: 0.98em;
    font-weight: 600;
    margin: 0.65rem 0 0.25rem;
    color: rgba(226, 232, 240, 0.85);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* ── Blockquotes ── */
  .chat-prose :global(blockquote) {
    border-left: 3px solid var(--color-accent);
    background: rgba(88, 180, 208, 0.04);
    padding: 0.35rem 0.85rem;
    margin: 0.5rem 0;
    border-radius: 0 6px 6px 0;
    color: var(--color-text-secondary);
  }

  /* ── Tables ── */
  .chat-prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
    font-size: 0.9em;
    border-radius: 6px;
    overflow: hidden;
  }
  .chat-prose :global(th), .chat-prose :global(td) {
    border: 1px solid var(--color-border);
    padding: 0.4rem 0.6rem;
  }
  .chat-prose :global(th) {
    background: var(--color-bg-secondary);
    font-weight: 700;
    color: var(--color-accent);
  }
  .chat-prose :global(tr:nth-child(even)) {
    background: rgba(255, 255, 255, 0.02);
  }

  /* ── Highlighted text ── */
  .chat-prose :global(mark) {
    background: rgba(234, 179, 8, 0.2);
    color: rgb(253, 224, 71);
    padding: 0.05em 0.25em;
    border-radius: 3px;
  }

  /* ── Strikethrough ── */
  .chat-prose :global(del) {
    color: var(--color-text-muted);
    text-decoration: line-through;
    opacity: 0.7;
  }

  /* ── Horizontal rules ── */
  .chat-prose :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0.85rem 0;
    opacity: 0.6;
  }

  /* ── Inline formatting ── */
  .chat-prose :global(strong) {
    font-weight: 700;
    color: rgba(88, 180, 208, 0.95);
  }
  .chat-prose :global(em) {
    color: rgba(88, 180, 208, 0.85);
    font-style: italic;
  }
  .chat-prose :global(strong em), .chat-prose :global(em strong) {
    color: var(--color-accent);
    font-weight: 700;
    font-style: italic;
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
