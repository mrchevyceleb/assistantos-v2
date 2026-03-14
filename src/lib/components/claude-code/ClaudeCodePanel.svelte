<script lang="ts">
  import { tick } from 'svelte';
  import { claudeCodeSessions, sendToClaudeCode, stopClaudeCode, removeClaudeCodeSession, setClaudeCodeModel } from '$lib/stores/claude-code';
  import { settings, aiSettingsVisible } from '$lib/stores/settings';
  import CCMessage from './ClaudeCodeMessage.svelte';
  import ChatInput from '../chat/ChatInput.svelte';

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

  // Model switcher
  let modelDropdownOpen = $state(false);
  const MODEL_OPTIONS = [
    { id: '', label: 'Default', desc: 'Use CLI default' },
    { id: 'opus', label: 'Opus', desc: 'Most capable' },
    { id: 'sonnet', label: 'Sonnet', desc: 'Fast + capable' },
    { id: 'haiku', label: 'Haiku', desc: 'Fastest' },
  ];

  // Font settings
  const chatFs = $derived($settings.aiChatFontSize);
  const FONT_MAP: Record<string, string> = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    inter: '"Inter", -apple-system, sans-serif',
    jetbrains: '"JetBrains Mono", "Cascadia Code", monospace',
    cascadia: '"Cascadia Code", "Fira Code", monospace',
    fira: '"Fira Code", "JetBrains Mono", monospace',
  };
  const chatFont = $derived(FONT_MAP[$settings.aiChatFontFamily] || FONT_MAP.system);

  // Filter messages
  let visibleMessages = $derived((() => {
    if (!session) return [];
    let seenInit = false;
    return session.messages.filter((m) => {
      if (m.type === "user" || m.type === "assistant" || m.type === "result" || m.type === "error") return true;
      if (m.type === "system" && m.raw?.subtype === "init" && !seenInit) {
        seenInit = true;
        return true;
      }
      return false;
    });
  })());

  let isRunning = $derived(session?.status === "running");
  let isReady = $derived(session?.status === "ready");
  let modelDisplay = $derived((() => {
    const selected = session?.selectedModel;
    const detected = session?.model?.replace(/\[.*\]/, '');
    if (selected) return selected;
    return detected || "";
  })());

  // Context usage
  let contextUsage = $derived(session?.contextUsage);
  let contextPercent = $derived((() => {
    if (!contextUsage) return 0;
    const total = contextUsage.inputTokens + contextUsage.outputTokens + contextUsage.cacheCreationTokens;
    return Math.min(100, Math.round((total / contextUsage.contextWindow) * 100));
  })());
  let contextColor = $derived(
    contextPercent >= 80 ? 'rgb(239, 68, 68)' :
    contextPercent >= 50 ? 'rgb(234, 179, 8)' :
    'rgb(34, 197, 94)'
  );

  // Slash commands from CLI
  let slashCommands = $derived(session?.slashCommands ?? []);

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

  function handleSend(message: string, payload?: { mentions?: string[] }) {
    if (!session || isRunning) return;
    let fullMessage = message;
    if (payload?.mentions && payload.mentions.length > 0) {
      const mentionList = payload.mentions.map(m => `@${m}`).join(' ');
      fullMessage = `${mentionList}\n\n${message}`;
    }
    sendToClaudeCode(sessionId, fullMessage);
  }

  function handleStop() {
    stopClaudeCode(sessionId);
  }

  function handleSteer(steer: string) {
    stopClaudeCode(sessionId).then(() => {
      setTimeout(() => sendToClaudeCode(sessionId, steer), 200);
    });
  }

  function handleClose() {
    removeClaudeCodeSession(sessionId);
  }

  function selectModel(modelId: string) {
    setClaudeCodeModel(sessionId, modelId);
    modelDropdownOpen = false;
  }

  // Click easter egg
  function handlePanelClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button, textarea, input, select, label, a, pre, code, .chat-prose, .cc-dropdown')) return;
    // Close dropdowns on outside click
    modelDropdownOpen = false;
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

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
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
    style="padding: 12px 16px; background: linear-gradient(180deg, rgba(20, 24, 36, 0.95) 0%, rgba(12, 15, 24, 0.98) 100%); z-index: 2;"
  >
    <!-- CC icon -->
    <div
      class="flex items-center justify-center rounded-lg shrink-0"
      style="width: 32px; height: 32px; background: linear-gradient(135deg, rgba(88, 180, 208, 0.2), rgba(88, 180, 208, 0.05)); border: 1px solid rgba(88, 180, 208, 0.25);"
    >
      <span class="text-accent font-mono font-bold" style="font-size: 13px;">CC</span>
    </div>

    <!-- Model switcher -->
    <div class="relative cc-dropdown">
      <button
        class="flex items-center gap-2 rounded-md hover:bg-bg-hover/50 transition-colors"
        style="padding: 6px 10px;"
        onclick={() => modelDropdownOpen = !modelDropdownOpen}
        title="Switch model"
      >
        <span class="text-text-primary font-medium truncate" style="font-size: 14px; max-width: 180px;">
          {modelDisplay || "Claude Code"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted/50 shrink-0">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if modelDropdownOpen}
        <div
          class="absolute left-0 top-full mt-1 rounded-lg border border-border bg-bg-primary/98 shadow-2xl overflow-hidden"
          style="z-index: 60; width: 220px;"
        >
          {#each MODEL_OPTIONS as opt}
            <button
              class="w-full text-left flex items-center justify-between hover:bg-bg-hover/50 transition-colors
                {(session?.selectedModel || '') === opt.id ? 'bg-accent/10 text-accent' : 'text-text-secondary'}"
              style="padding: 10px 14px; font-size: 13px;"
              onclick={() => selectModel(opt.id)}
            >
              <div>
                <div class="font-medium">{opt.label}</div>
                <div class="text-text-muted" style="font-size: 11px;">{opt.desc}</div>
              </div>
              {#if (session?.selectedModel || '') === opt.id}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-accent shrink-0">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex-1"></div>

    <!-- Context usage bar -->
    {#if contextUsage && contextUsage.inputTokens > 0}
      <div class="flex items-center gap-2" title="{formatTokens(contextUsage.inputTokens + contextUsage.outputTokens)} / {formatTokens(contextUsage.contextWindow)} tokens ({contextPercent}%)">
        <div class="rounded-full overflow-hidden bg-bg-tertiary" style="width: 80px; height: 6px;">
          <div
            class="h-full rounded-full transition-all"
            style="width: {contextPercent}%; background: {contextColor};"
          ></div>
        </div>
        <span class="text-text-muted font-mono" style="font-size: 12px;">{contextPercent}%</span>
      </div>
    {/if}

    <!-- Status -->
    {#if isRunning}
      <div class="flex items-center gap-1.5">
        <div class="w-2 h-2 rounded-full bg-accent" style="animation: cc-pulse 1.5s ease-in-out infinite;"></div>
        <span class="text-accent" style="font-size: 12px;">Running</span>
      </div>
    {:else if session?.status === "error"}
      <span class="text-error" style="font-size: 12px;">Error</span>
    {/if}

    <!-- Slash commands hint -->
    {#if slashCommands.length > 0 && !isRunning}
      <span class="text-text-muted/50 font-mono" style="font-size: 11px;" title={slashCommands.map(c => `/${c}`).join(', ')}>
        /{slashCommands.length} cmds
      </span>
    {/if}

    <!-- Settings -->
    <button
      class="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
      onclick={() => aiSettingsVisible.set(true)}
      title="AI & Display Settings"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    <!-- Stop -->
    {#if isRunning}
      <button
        class="rounded-md bg-error/15 text-error border border-error/25 hover:bg-error/25 transition-colors"
        style="padding: 5px 12px; font-size: 13px;"
        onclick={handleStop}
      >
        Stop
      </button>
    {/if}

    <!-- Close -->
    <button
      class="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
      onclick={handleClose}
      title="Close session"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- Messages area -->
  <div
    class="flex-1 overflow-y-auto relative select-text"
    style="z-index: 1; padding: 16px; font-size: {chatFs}px; font-family: {chatFont};"
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
          <span class="text-xs text-text-muted">Use @ to tag files, / for slash commands. Each message runs Claude Code in your workspace.</span>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each visibleMessages as msg (msg.seq)}
          <CCMessage message={msg} fontSize={chatFs} fontFamily={chatFont} />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input area -->
  <div class="shrink-0 relative" style="z-index: 1;">
    <ChatInput
      onSend={handleSend}
      onStop={handleStop}
      onSteer={handleSteer}
      isLoading={isRunning ?? false}
      disabled={false}
      extraSlashCommands={slashCommands}
    />
  </div>
</div>
