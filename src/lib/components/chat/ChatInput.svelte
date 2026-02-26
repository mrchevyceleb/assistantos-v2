<script lang="ts">
  interface Props {
    onSend: (message: string) => void;
    onStop: () => void;
    isLoading: boolean;
    disabled: boolean;
  }

  let { onSend, onStop, isLoading, disabled }: Props = $props();
  let inputText = $state('');
  let textarea: HTMLTextAreaElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && inputText.trim() && !disabled) {
        send();
      }
    }
    if (e.key === 'Escape' && isLoading) {
      e.preventDefault();
      onStop();
    }
  }

  function send() {
    const text = inputText.trim();
    if (!text) return;
    inputText = '';
    // Reset textarea height
    if (textarea) textarea.style.height = 'auto';
    onSend(text);
  }

  function autoResize() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  }

  $effect(() => {
    inputText;
    autoResize();
  });
</script>

<div class="px-4 py-4 border-t border-border/40">
  {#if disabled}
    <div class="text-text-muted text-[13px] text-center py-3 bg-bg-secondary/60 rounded-xl border border-border/30">
      Set your API key in Settings &rarr; AI Chat to get started
    </div>
  {:else}
    <div class="flex gap-3 items-end bg-bg-secondary/80 border border-border/40 rounded-xl px-4 py-3 focus-within:border-accent/40 transition-colors">
      <textarea
        bind:this={textarea}
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="Ask about your workspace..."
        rows="1"
        class="flex-1 bg-transparent text-text-primary text-[14px] resize-none outline-none leading-[1.4]
          placeholder:text-text-muted/60"
        style="min-height: 1.4em;"
        disabled={isLoading}
      ></textarea>
      {#if isLoading}
        <button
          onclick={onStop}
          class="shrink-0 w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors"
          title="Stop (Escape)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
        </button>
      {:else}
        <button
          onclick={send}
          disabled={!inputText.trim()}
          class="shrink-0 w-9 h-9 rounded-lg bg-accent/20 text-accent flex items-center justify-center
            hover:bg-accent/30 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>
