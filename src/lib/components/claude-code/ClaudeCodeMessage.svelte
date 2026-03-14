<script lang="ts">
  import type { ClaudeCodeMessage } from '$lib/stores/claude-code';
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    message: ClaudeCodeMessage;
    fontSize?: number;
    fontFamily?: string;
  }

  let { message, fontSize = 15, fontFamily = 'inherit' }: Props = $props();

  // Extract text content from messages
  let textContent = $derived((() => {
    if (message.type === "user") {
      if (typeof message.raw === "string") return message.raw;
      // tool_result messages from CLI have type "user" but contain objects - skip them
      return "";
    }
    if (message.type === "assistant") {
      const content = message.raw?.message?.content;
      if (Array.isArray(content)) {
        return content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      }
      return "";
    }
    if (message.type === "result") {
      return message.raw?.result || "";
    }
    if (message.type === "system") {
      const subtype = message.raw?.subtype;
      if (subtype === "init") {
        const model = (message.raw.model || "unknown").replace(/\[.*\]/, '');
        return `Session started. Model: ${model}`;
      }
      return "";
    }
    if (message.type === "error") {
      return message.raw?.error || JSON.stringify(message.raw);
    }
    return "";
  })());

  // Extract tool use blocks from assistant messages
  let toolUses = $derived((() => {
    if (message.type !== "assistant") return [];
    const content = message.raw?.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((c: any) => c.type === "tool_use");
  })());

  // Cost info from result messages
  let costInfo = $derived((() => {
    if (message.type !== "result") return null;
    const raw = message.raw;
    return {
      cost: raw.total_cost_usd,
      duration: raw.duration_ms,
      turns: raw.num_turns,
    };
  })());

  let isUser = $derived(message.type === "user");
  let isSystem = $derived(message.type === "system");
  let isResult = $derived(message.type === "result");
  let isError = $derived(message.type === "error");
  let isAssistant = $derived(message.type === "assistant");

  // Render markdown for assistant text content (with version guard against stale renders)
  let renderedHtml = $state('');
  let renderVersion = 0;

  $effect(() => {
    if (!isAssistant || !textContent) {
      renderedHtml = '';
      renderVersion++;
      return;
    }
    const thisVersion = ++renderVersion;
    renderMarkdown(textContent).then(html => {
      // Only apply if this is still the latest render request
      if (thisVersion === renderVersion) {
        // Sanitize: strip event handler attributes (onerror, onclick, etc.)
        renderedHtml = html.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
      }
    });
  });

  // Tool call expand state
  let expandedTools = $state<Set<number>>(new Set());
  function toggleTool(idx: number) {
    const next = new Set(expandedTools);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    expandedTools = next;
  }
</script>

{#if isUser && textContent}
  <!-- User message -->
  <div class="flex justify-end">
    <div
      class="rounded-xl max-w-[85%] text-text-primary select-text"
      style="
        padding: 10px 14px;
        font-size: {fontSize}px;
        font-family: {fontFamily};
        background: linear-gradient(135deg, rgba(88, 180, 208, 0.15), rgba(88, 180, 208, 0.08));
        border: 1px solid rgba(88, 180, 208, 0.2);
      "
    >
      <pre class="whitespace-pre-wrap break-words font-sans" style="margin: 0;">{textContent}</pre>
    </div>
  </div>
{:else if isSystem}
  <!-- System message (init) -->
  <div class="flex justify-center">
    <span class="text-text-muted font-mono" style="font-size: {fontSize - 4}px;">
      {textContent}
    </span>
  </div>
{:else if isResult}
  <!-- Result summary -->
  <div class="flex justify-center">
    <div
      class="rounded-lg border border-border/20 font-mono flex items-center gap-3"
      style="padding: 6px 14px; font-size: {fontSize - 4}px; background: rgba(34, 197, 94, 0.05);"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-success">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span class="text-text-muted">
        Done
        {#if costInfo}
          <span class="text-accent/60">
            {costInfo.duration ? `${(costInfo.duration / 1000).toFixed(1)}s` : ""}
            {costInfo.cost ? ` $${costInfo.cost.toFixed(4)}` : ""}
            {costInfo.turns ? ` ${costInfo.turns} turn${costInfo.turns > 1 ? 's' : ''}` : ""}
          </span>
        {/if}
      </span>
    </div>
  </div>
{:else if isError}
  <!-- Error message -->
  <div
    class="rounded-lg border border-error/20 text-error select-text"
    style="padding: 10px 14px; font-size: {fontSize}px; background: rgba(239, 68, 68, 0.06);"
  >
    <pre class="whitespace-pre-wrap break-words font-mono" style="margin: 0;">{textContent}</pre>
  </div>
{:else if isAssistant}
  <!-- Assistant message -->
  <div class="flex flex-col gap-2">
    {#if renderedHtml}
      <div
        class="rounded-xl text-text-primary max-w-[95%] chat-prose select-text"
        style="
          padding: 10px 14px;
          font-size: {fontSize}px;
          font-family: {fontFamily};
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        "
      >
        {@html renderedHtml}
      </div>
    {:else if textContent}
      <div
        class="rounded-xl text-text-primary max-w-[95%] select-text"
        style="
          padding: 10px 14px;
          font-size: {fontSize}px;
          font-family: {fontFamily};
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        "
      >
        <pre class="whitespace-pre-wrap break-words font-sans" style="margin: 0;">{textContent}</pre>
      </div>
    {/if}

    <!-- Tool use blocks -->
    {#each toolUses as tool, idx}
      <div
        class="rounded-lg border overflow-hidden"
        style="
          border-left: 3px solid var(--color-accent);
          border-color: rgba(88, 180, 208, 0.2);
          background: rgba(88, 180, 208, 0.03);
          font-size: {fontSize - 2}px;
        "
      >
        <button
          class="w-full flex items-center gap-2 hover:bg-bg-hover/30 transition-colors text-left"
          style="padding: 6px 10px;"
          onclick={() => toggleTool(idx)}
        >
          <div class="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-accent/60" style="animation: cc-pulse 1.5s ease-in-out infinite;"></div>
          </div>
          <span class="text-text-secondary font-mono truncate">{tool.name}</span>
          <span class="flex-1"></span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted/40 shrink-0 transition-transform {expandedTools.has(idx) ? 'rotate-90' : ''}">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        {#if expandedTools.has(idx)}
          <div class="border-t border-border/15" style="padding: 8px 10px;">
            {#if tool.input}
              <div>
                <div class="text-text-muted uppercase tracking-wider font-medium" style="font-size: {fontSize - 4}px; margin-bottom: 4px;">Input</div>
                <pre class="text-text-secondary font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto bg-bg-tertiary/50 rounded-md border border-border/15 select-text" style="padding: 8px;">{JSON.stringify(tool.input, null, 2)}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

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
</style>
