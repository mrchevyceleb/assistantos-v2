<script lang="ts">
  import { settings, updateSetting } from '$lib/stores/settings';
  import type { AppSettings } from '$lib/stores/settings';
</script>

<div style="display: flex; flex-direction: column; gap: 24px;">
  <!-- Generation Parameters -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
    <!-- Temperature -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px] font-medium">Temperature</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">0 = deterministic, 2 = creative</div>
      </div>
      <div class="flex items-center" style="gap: 12px;">
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={$settings.aiTemperature}
          oninput={(e) => updateSetting('aiTemperature', Number(e.currentTarget.value))}
          class="accent-[var(--color-accent)]"
          style="width: 112px;"
        />
        <span class="text-[13px] text-text-primary bg-bg-primary rounded-md border border-border/30 text-center font-mono" style="padding: 4px 10px; min-width: 2.5rem;">{$settings.aiTemperature}</span>
      </div>
    </div>

    <!-- Max Output Tokens -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px] font-medium">Max Output Tokens</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Maximum response length</div>
      </div>
      <select
        class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
        style="padding: 8px 16px;"
        value={$settings.aiMaxTokens}
        onchange={(e) => updateSetting('aiMaxTokens', Number(e.currentTarget.value))}
      >
        <option value={4096}>4,096</option>
        <option value={8192}>8,192</option>
        <option value={16384}>16,384</option>
        <option value={32768}>32,768</option>
        <option value={65536}>65,536</option>
        <option value={128000}>128,000</option>
        <option value={200000}>200,000</option>
      </select>
    </div>
  </div>

  <!-- Chat Display -->
  <div class="rounded-xl bg-bg-secondary/40 border border-border/25 overflow-hidden divide-y divide-border/15">
    <!-- Chat font size -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Chat font size</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Message text size in pixels (Ctrl+/- to adjust)</div>
      </div>
      <div class="flex items-center" style="gap: 12px;">
        <input
          type="range"
          min="10"
          max="24"
          step="1"
          value={$settings.aiChatFontSize}
          oninput={(e) => updateSetting('aiChatFontSize', Number(e.currentTarget.value))}
          class="accent-[var(--color-accent)]"
          style="width: 96px;"
        />
        <span class="text-[13px] text-text-primary bg-bg-primary rounded-md border border-border/30 text-center font-mono" style="padding: 4px 10px; min-width: 3rem;">{$settings.aiChatFontSize}px</span>
      </div>
    </div>

    <!-- Chat font family -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Chat font</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Font family for chat messages</div>
      </div>
      <select
        class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
        style="padding: 8px 16px;"
        value={$settings.aiChatFontFamily}
        onchange={(e) => updateSetting('aiChatFontFamily', e.currentTarget.value)}
      >
        <option value="system">System Default</option>
        <option value="inter">Inter</option>
        <option value="jetbrains">JetBrains Mono</option>
        <option value="cascadia">Cascadia Code</option>
        <option value="fira">Fira Code</option>
      </select>
    </div>

    <!-- Chat dock position -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Chat dock position</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Where AI chat appears in the workspace</div>
      </div>
      <select
        class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
        style="padding: 8px 16px;"
        value={$settings.aiChatDock}
        onchange={(e) => updateSetting('aiChatDock', e.currentTarget.value as AppSettings['aiChatDock'])}
      >
        <option value="right">Right</option>
        <option value="bottom">Bottom</option>
        <option value="tab">Tab</option>
      </select>
    </div>

    <!-- Thinking Visibility -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Thinking Visibility</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Choose how much reasoning text to show in messages</div>
      </div>
      <select
        class="bg-bg-primary border border-border/40 rounded-lg text-text-primary text-[13.5px] outline-none focus:border-accent/40 transition-colors"
        style="padding: 8px 16px;"
        value={$settings.aiThinkingMode}
        onchange={(e) => updateSetting('aiThinkingMode', e.currentTarget.value as AppSettings['aiThinkingMode'])}
      >
        <option value="all">Show All</option>
        <option value="preview">Preview + Expand</option>
        <option value="none">Hide</option>
      </select>
    </div>

    <!-- Reload instructions -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Reload AGENTS/CLAUDE each message</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Keeps workspace instructions in sync while files change</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiReadInstructionsEveryMessage ? 'bg-accent' : 'bg-bg-active'}"
        style="width: 46px; height: 26px;"
        onclick={() => updateSetting('aiReadInstructionsEveryMessage', !$settings.aiReadInstructionsEveryMessage)}
      >
        <div class="absolute rounded-full bg-white shadow transition-transform {$settings.aiReadInstructionsEveryMessage ? 'translate-x-[22px]' : 'translate-x-[2px]'}" style="top: 2px; width: 22px; height: 22px;"></div>
      </div>
    </div>

    <!-- Enable @ file tagging -->
    <div class="settings-row">
      <div>
        <div class="text-text-primary text-[13.5px]">Enable @ file tagging</div>
        <div class="text-text-muted text-[12px]" style="margin-top: 4px;">Use @ in chat input to tag workspace files and folders</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="rounded-full relative cursor-pointer transition-colors shrink-0 {$settings.aiEnableAtMentions ? 'bg-accent' : 'bg-bg-active'}"
        style="width: 46px; height: 26px;"
        onclick={() => updateSetting('aiEnableAtMentions', !$settings.aiEnableAtMentions)}
      >
        <div class="absolute rounded-full bg-white shadow transition-transform {$settings.aiEnableAtMentions ? 'translate-x-[22px]' : 'translate-x-[2px]'}" style="top: 2px; width: 22px; height: 22px;"></div>
      </div>
    </div>
  </div>
</div>

<style>
  .settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 28px;
  }
</style>
