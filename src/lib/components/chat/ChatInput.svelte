<script lang="ts">
  import { workspacePath, fileTree } from "$lib/stores/workspace";
  import { settings } from "$lib/stores/settings";
  import { listAllFiles } from "$lib/utils/tauri";

  interface SendPayload {
    mentions?: string[];
    steer?: string;
  }

  interface Props {
    onSend: (message: string, payload?: SendPayload) => void;
    onStop: () => void;
    onSteer: (steer: string) => void;
    isLoading: boolean;
    disabled: boolean;
  }

  let { onSend, onStop, onSteer, isLoading, disabled }: Props = $props();
  let inputText = $state("");
  let steerText = $state("");
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let showSteerBox = $state(false);

  let allMentions = $state<Array<{ path: string; kind: "file" | "folder" }>>([]);
  let mentionQuery = $state("");
  let mentionAnchor = $state(-1);
  let mentionSuggestions = $state<Array<{ path: string; kind: "file" | "folder" }>>([]);
  let mentionSelectedIndex = $state(0);
  let selectedMentions = $state<string[]>([]);

  $effect(() => {
    const root = $workspacePath;
    if (!root || !$settings.aiEnableAtMentions) {
      allMentions = [];
      return;
    }

    const folders = new Set<string>();
    const walk = (node: any) => {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (child.is_dir) {
          const rel = child.path.replace(root, "").replace(/^[/\\]/, "");
          if (rel) folders.add(rel);
          walk(child);
        }
      }
    };
    walk($fileTree);

    listAllFiles(root, $settings.showHiddenFiles)
      .then((files) => {
        const mentionItems: Array<{ path: string; kind: "file" | "folder" }> = files
          .slice(0, 5000)
          .map((f) => ({ path: f.relative_path, kind: "file" }));
        for (const folder of folders) {
          mentionItems.push({ path: folder, kind: "folder" });
        }
        allMentions = mentionItems;
      })
      .catch(() => {
        allMentions = [];
      });
  });

  function updateMentionSuggestions() {
    if (!$settings.aiEnableAtMentions || !textarea) {
      mentionAnchor = -1;
      mentionSuggestions = [];
      return;
    }

    const cursor = textarea.selectionStart;
    const before = inputText.slice(0, cursor);
    const tokenMatch = before.match(/(^|\s)@([^\s@]*)$/);
    if (!tokenMatch) {
      mentionAnchor = -1;
      mentionSuggestions = [];
      mentionQuery = "";
      return;
    }

    mentionQuery = tokenMatch[2].toLowerCase();
    mentionAnchor = cursor - tokenMatch[2].length - 1;
    mentionSelectedIndex = 0;

    const candidates = allMentions
      .filter((f) => {
        const path = f.path.toLowerCase();
        const name = f.path.split(/[\\/]/).pop()?.toLowerCase() || "";
        if (!mentionQuery) return true;
        return path.includes(mentionQuery) || name.startsWith(mentionQuery);
      })
      .slice(0, 8);

    mentionSuggestions = candidates;
  }

  function attachMention(file: { path: string; kind: "file" | "folder" }) {
    if (!textarea || mentionAnchor < 0) return;
    const anchor = mentionAnchor;
    const cursor = textarea.selectionStart;
    const mentionText = `@${file.path}`;
    inputText = `${inputText.slice(0, anchor)}${mentionText} ${inputText.slice(cursor)}`;
    mentionAnchor = -1;
    mentionSuggestions = [];
    if (!selectedMentions.includes(file.path)) {
      selectedMentions = [...selectedMentions, file.path];
    }
    requestAnimationFrame(() => {
      const next = anchor + mentionText.length + 1;
      textarea?.focus();
      if (textarea) {
        textarea.selectionStart = next;
        textarea.selectionEnd = next;
      }
      autoResize();
    });
  }

  function removeMention(path: string) {
    selectedMentions = selectedMentions.filter((m) => m !== path);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, mentionSuggestions.length - 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const selected = mentionSuggestions[mentionSelectedIndex];
        if (selected) attachMention(selected);
        return;
      }
      if (e.key === "Escape") {
        mentionSuggestions = [];
        mentionAnchor = -1;
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && inputText.trim() && !disabled) {
        send();
      }
    }
    if (e.key === "Escape" && isLoading) {
      e.preventDefault();
      onStop();
    }
  }

  function send() {
    const text = inputText.trim();
    if (!text) return;
    const mentions = selectedMentions.length > 0 ? [...selectedMentions] : undefined;
    inputText = "";
    selectedMentions = [];
    mentionSuggestions = [];
    mentionAnchor = -1;
    if (textarea) textarea.style.height = "auto";
    onSend(text, { mentions });
  }

  function submitSteer() {
    const text = steerText.trim();
    if (!text) return;
    steerText = "";
    showSteerBox = false;
    onSteer(text);
  }

  function autoResize() {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
    }
  }

  function handleInput() {
    autoResize();
    updateMentionSuggestions();
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
    <div class="bg-bg-secondary/60 border border-border/30 rounded-xl focus-within:border-accent/30 focus-within:shadow-[0_0_12px_rgba(88,180,208,0.06)] transition-all duration-200">
      {#if selectedMentions.length > 0}
        <div class="px-3 pt-2 flex flex-wrap gap-1.5">
          {#each selectedMentions as mention}
            <button
              class="text-[11px] px-2 py-1 rounded-md bg-accent/15 border border-accent/25 text-accent/90"
              onclick={() => removeMention(mention)}
              title="Remove mention"
            >
              @{mention} ×
            </button>
          {/each}
        </div>
      {/if}

      <div class="relative">
        <textarea
          bind:this={textarea}
          bind:value={inputText}
          onkeydown={handleKeydown}
          oninput={handleInput}
          placeholder="Ask about your workspace... Use @ to tag files"
          rows="2"
          class="w-full bg-transparent text-text-primary text-[15px] resize-none outline-none leading-[1.6] placeholder:text-text-muted/50 px-4 pt-3 pb-2"
          style="min-height: 3.2em;"
          disabled={isLoading}
        ></textarea>

        {#if mentionSuggestions.length > 0}
          <div class="absolute z-50 left-3 right-3 bottom-[100%] mb-2 rounded-lg border border-border bg-bg-primary/95 max-h-52 overflow-y-auto shadow-2xl">
            {#each mentionSuggestions as suggestion, i (suggestion.path)}
              <button
                class="w-full text-left px-3 py-2 text-[12px] font-mono transition-colors {i === mentionSelectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}"
                onclick={() => attachMention(suggestion)}
              >
                <span class="opacity-70 mr-1.5">{suggestion.kind === 'folder' ? 'dir' : 'file'}</span>{suggestion.path}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if showSteerBox && isLoading}
        <div class="px-3 pb-2">
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={steerText}
              class="flex-1 bg-bg-primary border border-border/40 rounded-md px-3 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent/40"
              placeholder="Steer the response. Example: focus only on src/lib"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSteer();
                }
              }}
            />
            <button class="px-2.5 py-1.5 text-[12px] rounded-md bg-accent/20 border border-accent/30 text-accent" onclick={submitSteer}>Apply</button>
          </div>
        </div>
      {/if}

      <div class="flex items-center justify-between px-3 pb-2.5">
        <div class="text-[11px] text-text-muted/40 select-none">
          {#if isLoading}
            Generating...
          {:else if $settings.aiEnableAtMentions}
            Enter to send, @ to tag files
          {:else}
            Enter to send
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if isLoading}
            <button
              onclick={() => (showSteerBox = !showSteerBox)}
              class="h-8 rounded-lg px-2.5 text-[11px] border border-accent/25 text-accent/90 hover:bg-accent/10 transition-all"
              title="Steer response"
            >
              Steer
            </button>
            <button
              onclick={onStop}
              class="w-8 h-8 rounded-lg bg-error/15 border border-error/25 text-error/80 flex items-center justify-center hover:bg-error/25 hover:text-error transition-all"
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
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-all {inputText.trim() ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/25' : 'text-text-muted/30 cursor-default'}"
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
    </div>
  {/if}
</div>
