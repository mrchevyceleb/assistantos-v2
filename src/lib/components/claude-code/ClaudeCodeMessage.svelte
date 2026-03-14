<script lang="ts">
  import type { ClaudeCodeMessage } from '$lib/stores/claude-code';

  interface Props {
    message: ClaudeCodeMessage;
  }

  let { message }: Props = $props();

  // Extract text content from assistant messages
  let textContent = $derived((() => {
    if (message.type === "user") return String(message.raw);
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
        return `Session started. Model: ${message.raw.model || "unknown"}`;
      }
      return `[system] ${subtype || ""}`;
    }
    if (message.type === "error") {
      return message.raw?.error || JSON.stringify(message.raw);
    }
    return JSON.stringify(message.raw);
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

  // Tool call expand state
  let expandedTools = $state<Set<number>>(new Set());
  function toggleTool(idx: number) {
    const next = new Set(expandedTools);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    expandedTools = next;
  }
</script>

{#if isUser}
  <!-- User message -->
  <div class="flex justify-end">
    <div
      class="rounded-xl max-w-[85%] text-text-primary"
      style="
        padding: 10px 14px;
        font-size: calc(13.5px * var(--ui-zoom, 1));
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
    <span class="text-text-muted font-mono" style="font-size: calc(11px * var(--ui-zoom, 1));">
      {textContent}
    </span>
  </div>
{:else if isResult}
  <!-- Result summary -->
  <div class="flex justify-center">
    <div
      class="rounded-lg border border-border/20 font-mono flex items-center gap-3"
      style="padding: 6px 14px; font-size: calc(11px * var(--ui-zoom, 1)); background: rgba(34, 197, 94, 0.05);"
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
    class="rounded-lg border border-error/20 text-error"
    style="padding: 10px 14px; font-size: calc(13px * var(--ui-zoom, 1)); background: rgba(239, 68, 68, 0.06);"
  >
    <pre class="whitespace-pre-wrap break-words font-mono" style="margin: 0;">{textContent}</pre>
  </div>
{:else}
  <!-- Assistant message -->
  <div class="flex flex-col gap-2">
    {#if textContent}
      <div
        class="rounded-xl text-text-primary max-w-[95%]"
        style="
          padding: 10px 14px;
          font-size: calc(13.5px * var(--ui-zoom, 1));
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
          font-size: calc(13px * var(--ui-zoom, 1));
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
                <div class="text-text-muted uppercase tracking-wider font-medium" style="font-size: calc(11px * var(--ui-zoom, 1)); margin-bottom: 4px;">Input</div>
                <pre class="text-text-secondary font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto bg-bg-tertiary/50 rounded-md border border-border/15" style="padding: 8px;">{JSON.stringify(tool.input, null, 2)}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
