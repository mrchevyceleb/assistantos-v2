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
    if (textarea) textarea.style.height = 'auto';
    onSend(text);
  }

  function autoResize() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  $effect(() => {
    inputText;
    autoResize();
  });
</script>

<div class="px-3 pb-3 pt-2">
  {#if disabled}
    <div class="text-text-muted text-[13px] text-center py-4 bg-bg-secondary/40 rounded-xl border border-border/20">
      Set your API key in Settings to get started
    </div>
  {:else}
    <div class="bg-bg-secondary/60 border border-border/30 rounded-xl
      focus-within:border-accent/30 focus-within:shadow-[0_0_12px_rgba(88,180,208,0.06)]
      transition-all duration-200">
      <textarea
        bind:this={textarea}
        bind:value={inputText}
        onkeydown={handleKeydown}
        placeholder="Ask about your workspace..."
        rows="2"
        class="w-full bg-transparent text-text-primary text-[15px] resize-none outline-none leading-[1.6]
          placeholder:text-text-muted/50 px-4 pt-3 pb-2"
        style="min-height: 3.2em;"
        disabled={isLoading}
      ></textarea>
      <!-- Bottom action bar -->
      <div class="flex items-center justify-between px-3 pb-2.5">
        <div class="text-[11px] text-text-muted/40 select-none">
          {#if isLoading}
            Generating...
          {:else}
            Enter to send
          {/if}
        </div>
        {#if isLoading}
          <button
            onclick={onStop}
            class="w-8 h-8 rounded-lg bg-error/15 border border-error/25 text-error/80
              flex items-center justify-center hover:bg-error/25 hover:text-error transition-all"
            title="Stop (Escape)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        {:else}
          <button
            onclick={send}
            disabled={!inputText.trim()}
            class="w-8 h-8 rounded-lg flex items-center justify-center transition-all
              {inputText.trim()
                ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/25'
                : 'text-text-muted/30 cursor-default'}"
            title="Send (Enter)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
