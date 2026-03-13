<script lang="ts">
  import { aiSettingsVisible } from '$lib/stores/settings';
  import ModelsTab from './ModelsTab.svelte';
  import GenerationTab from './GenerationTab.svelte';
  import ToolsMcpTab from './ToolsMcpTab.svelte';

  type Tab = 'models' | 'generation' | 'tools';
  let activeTab = $state<Tab>('models');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'models', label: 'Models' },
    { id: 'generation', label: 'Generation' },
    { id: 'tools', label: 'Tools & MCP' },
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      aiSettingsVisible.set(false);
    }
  }

  function close() {
    aiSettingsVisible.set(false);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex-1 flex flex-col overflow-hidden glass-panel-solid" style="height: 100%;">
  <!-- Header -->
  <div class="flex items-center shrink-0 border-b border-border/40 bg-bg-secondary/65 metal-sheen" style="padding: 0 24px; height: 56px; gap: 16px;">
    <button
      class="flex items-center justify-center rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
      style="width: 32px; height: 32px;"
      onclick={close}
      aria-label="Back"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h2 class="text-text-primary text-[16px] font-semibold tracking-wide">AI & Models</h2>

    <!-- Tab bar -->
    <div class="flex items-center" style="gap: 4px; margin-left: 24px;">
      {#each tabs as tab}
        <button
          class="rounded-md transition-colors text-[13px] font-medium
            {activeTab === tab.id
              ? 'text-accent bg-accent/10'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover/60'}"
          style="padding: 6px 14px;"
          onclick={() => activeTab = tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto" style="padding: 24px 32px;">
    <div style="max-width: 800px; margin: 0 auto;">
      {#if activeTab === 'models'}
        <ModelsTab />
      {:else if activeTab === 'generation'}
        <GenerationTab />
      {:else if activeTab === 'tools'}
        <ToolsMcpTab />
      {/if}
    </div>
  </div>
</div>
