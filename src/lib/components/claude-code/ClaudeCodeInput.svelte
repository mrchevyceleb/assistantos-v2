<script lang="ts">
  interface Props {
    onSend: (message: string) => void;
    disabled?: boolean;
    isRunning?: boolean;
  }

  let { onSend, disabled = false, isRunning = false }: Props = $props();

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement;

  function handleSubmit() {
    const msg = inputValue.trim();
    if (!msg || disabled) return;
    onSend(msg);
    inputValue = '';
    // Reset textarea height
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  }
</script>

<div
  class="border-t border-border/30"
  style="padding: 12px 16px; background: linear-gradient(180deg, rgba(14, 17, 26, 0.95) 0%, rgba(10, 12, 20, 0.98) 100%);"
>
  <div
    class="flex items-end gap-2 rounded-xl border border-border/30 transition-colors focus-within:border-accent/40"
    style="padding: 8px 12px; background: rgba(255, 255, 255, 0.03);"
  >
    <textarea
      bind:this={textareaEl}
      bind:value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeydown}
      placeholder={isRunning ? "Claude is working..." : "Send a message to Claude Code..."}
      disabled={disabled}
      rows="1"
      class="flex-1 bg-transparent text-text-primary placeholder-text-muted/50 resize-none outline-none"
      style="font-size: calc(13.5px * var(--ui-zoom, 1)); max-height: 200px; line-height: 1.5;"
    ></textarea>

    <button
      class="shrink-0 rounded-lg flex items-center justify-center transition-all"
      style="
        width: 32px;
        height: 32px;
        background: {inputValue.trim() ? 'rgba(88, 180, 208, 0.2)' : 'rgba(255, 255, 255, 0.05)'};
        border: 1px solid {inputValue.trim() ? 'rgba(88, 180, 208, 0.3)' : 'rgba(255, 255, 255, 0.08)'};
      "
      onclick={handleSubmit}
      disabled={disabled || !inputValue.trim()}
      aria-label="Send message"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        class="{inputValue.trim() ? 'text-accent' : 'text-text-muted/30'} transition-colors"
      >
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>

  <div class="flex items-center justify-between" style="padding-top: 6px;">
    <span class="text-text-muted/40 font-mono" style="font-size: 10px;">
      Enter to send, Shift+Enter for newline
    </span>
  </div>
</div>
