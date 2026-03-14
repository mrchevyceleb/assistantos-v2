<script lang="ts">
  import { tick } from 'svelte';
  import { claudeCodeSessions, sendToClaudeCode, stopClaudeCode, removeClaudeCodeSession } from '$lib/stores/claude-code';
  import CCMessage from './ClaudeCodeMessage.svelte';
  import ClaudeCodeInput from './ClaudeCodeInput.svelte';

  interface Props {
    sessionId: string;
  }

  let { sessionId }: Props = $props();

  let session = $derived((() => {
    const sessions = $claudeCodeSessions;
    return sessions.get(sessionId);
  })());

  let messagesContainer: HTMLDivElement;
  let shouldAutoScroll = $state(true);
  const AUTO_SCROLL_THRESHOLD_PX = 96;

  // Filter messages to show
  let visibleMessages = $derived(
    session?.messages.filter((m) =>
      m.type === "user" || m.type === "assistant" || m.type === "system" || m.type === "result" || m.type === "error"
    ) ?? []
  );

  let isRunning = $derived(session?.status === "running");
  let isReady = $derived(session?.status === "ready");
  let costDisplay = $derived(session?.totalCost ? `$${session.totalCost.toFixed(4)}` : null);
  let modelDisplay = $derived(session?.model?.replace(/\[.*\]/, '') ?? "");

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < AUTO_SCROLL_THRESHOLD_PX;
  }

  async function scrollToBottom() {
    await tick();
    if (messagesContainer && shouldAutoScroll) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  $effect(() => {
    if (session?.messages.length) {
      scrollToBottom();
    }
  });

  async function handleSend(message: string) {
    if (!session || !message.trim() || isRunning) return;
    await sendToClaudeCode(sessionId, message);
  }

  function handleStop() {
    stopClaudeCode(sessionId);
  }

  function handleClose() {
    removeClaudeCodeSession(sessionId);
  }

  // Click easter egg
  function handlePanelClick(e: MouseEvent) {
    const symbols = ['>', '_', '/', '\\', '|', '{', '}', '$', '#', '~'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const el = document.createElement('span');
    el.textContent = symbol;
    el.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      pointer-events: none;
      font-family: monospace;
      font-size: 18px;
      color: rgba(88, 180, 208, 0.7);
      z-index: 9999;
      animation: cc-float 1s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
</script>

<svelte:head>
  <style>
    @keyframes cc-float {
      0% { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-40px) scale(0.5) rotate(20deg); }
    }
    @keyframes cc-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
    @keyframes cc-drift {
      0% { transform: translateY(0) translateX(0); }
      50% { transform: translateY(-15px) translateX(8px); }
      100% { transform: translateY(0) translateX(0); }
    }
  </style>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="h-full flex flex-col relative overflow-hidden"
  style="background: linear-gradient(180deg, rgba(10, 12, 20, 0.97) 0%, rgba(8, 10, 16, 0.99) 100%);"
  onclick={handlePanelClick}
>
  <!-- Floating background elements -->
  <div class="absolute inset-0 pointer-events-none overflow-hidden" style="z-index: 0;">
    {#each Array(6) as _, i}
      <span
        class="absolute text-accent/10 font-mono select-none"
        style="
          left: {10 + i * 15}%;
          top: {5 + (i * 17) % 80}%;
          font-size: {10 + (i % 3) * 4}px;
          animation: cc-drift {4 + i * 1.3}s ease-in-out infinite;
          animation-delay: {i * 0.7}s;
        "
      >
        {['>', '$', '~', '_', '|', '#'][i]}
      </span>
    {/each}
  </div>

  <!-- Header -->
  <div
    class="flex items-center gap-3 border-b border-border/40 shrink-0 relative"
    style="padding: 10px 16px; background: linear-gradient(180deg, rgba(20, 24, 36, 0.95) 0%, rgba(12, 15, 24, 0.98) 100%); z-index: 1;"
  >
    <!-- Claude Code logo/icon -->
    <div
      class="flex items-center justify-center rounded-lg"
      style="width: 28px; height: 28px; background: linear-gradient(135deg, rgba(88, 180, 208, 0.2), rgba(88, 180, 208, 0.05)); border: 1px solid rgba(88, 180, 208, 0.25);"
    >
      <span class="text-accent font-mono font-bold" style="font-size: 13px;">CC</span>
    </div>

    <div class="flex flex-col min-w-0">
      <span class="text-text-primary text-sm font-medium">Claude Code</span>
      <span class="text-text-muted font-mono truncate" style="font-size: 11px;">
        {modelDisplay || "ready"}
        {#if costDisplay}
          <span class="text-accent/60"> {costDisplay}</span>
        {/if}
      </span>
    </div>

    <div class="flex-1"></div>

    <!-- Status indicator -->
    {#if isRunning}
      <div class="flex items-center gap-1.5">
        <div class="w-2 h-2 rounded-full bg-accent" style="animation: cc-pulse 1.5s ease-in-out infinite;"></div>
        <span class="text-accent text-xs">Running</span>
      </div>
    {:else if session?.status === "error"}
      <span class="text-error text-xs">Error</span>
    {:else if isReady && visibleMessages.length > 0}
      <span class="text-text-muted text-xs">Ready</span>
    {/if}

    <!-- Stop / Close buttons -->
    {#if isRunning}
      <button
        class="px-2.5 py-1 rounded-md text-xs bg-error/15 text-error border border-error/25 hover:bg-error/25 transition-colors"
        onclick={handleStop}
      >
        Stop
      </button>
    {/if}
    <button
      class="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
      onclick={handleClose}
      title="Close session"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- Messages area -->
  <div
    class="flex-1 overflow-y-auto relative"
    style="z-index: 1; padding: 16px;"
    bind:this={messagesContainer}
    onscroll={handleScroll}
  >
    {#if !session}
      <div class="flex items-center justify-center h-full text-text-muted text-sm">
        Session not found.
      </div>
    {:else if visibleMessages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        {#if session.status === "error"}
          <span class="text-error text-sm">{session.error || "Failed to start Claude Code"}</span>
          <span class="text-xs text-text-muted">Make sure claude is installed and on your PATH</span>
        {:else}
          <span class="text-sm">Send a message to get started.</span>
          <span class="text-xs text-text-muted">Each message runs Claude Code in your workspace.</span>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each visibleMessages as msg (msg.seq)}
          <CCMessage message={msg} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input area -->
  <div class="shrink-0 relative" style="z-index: 1;">
    <ClaudeCodeInput
      onSend={handleSend}
      disabled={isRunning}
      {isRunning}
    />
  </div>
</div>
