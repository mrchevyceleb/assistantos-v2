<script lang="ts">
  import { workspacePath, fileTree } from "$lib/stores/workspace";
  import { settings } from "$lib/stores/settings";
  import { listAllFiles, readDirectoryChildren, readFileText } from "$lib/utils/tauri";

  interface SendPayload {
    mentions?: string[];
    steer?: string;
    slashCommandName?: string;
    slashCommandPrompt?: string;
    slashCommandArgs?: string;
  }

  interface SlashCommand {
    name: string;
    prompt: string;
    description?: string;
    sourcePath: string;
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
  let slashCommands = $state<SlashCommand[]>([]);
  let slashSuggestions = $state<SlashCommand[]>([]);
  let slashSelectedIndex = $state(0);
  let loadingSlashCommands = $state(false);

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

  function normalizeCommandName(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "");
  }

  function parseJsonSlashCommands(json: unknown, sourcePath: string): SlashCommand[] {
    const commands: SlashCommand[] = [];

    const pushCommand = (name: string, prompt: string, description?: string) => {
      const normalized = normalizeCommandName(name);
      const trimmedPrompt = prompt.trim();
      if (!normalized || !trimmedPrompt) return;
      commands.push({ name: normalized, prompt: trimmedPrompt, description, sourcePath });
    };

    if (Array.isArray(json)) {
      for (const entry of json) {
        if (!entry || typeof entry !== "object") continue;
        const obj = entry as Record<string, unknown>;
        if (typeof obj.name === "string" && typeof obj.prompt === "string") {
          pushCommand(obj.name, obj.prompt, typeof obj.description === "string" ? obj.description : undefined);
        }
      }
      return commands;
    }

    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if (typeof obj.name === "string" && typeof obj.prompt === "string") {
        pushCommand(obj.name, obj.prompt, typeof obj.description === "string" ? obj.description : undefined);
        return commands;
      }

      for (const [name, value] of Object.entries(obj)) {
        if (typeof value === "string") {
          pushCommand(name, value);
        } else if (value && typeof value === "object") {
          const nested = value as Record<string, unknown>;
          if (typeof nested.prompt === "string") {
            pushCommand(
              typeof nested.name === "string" ? nested.name : name,
              nested.prompt,
              typeof nested.description === "string" ? nested.description : undefined,
            );
          }
        }
      }
    }

    return commands;
  }

  async function loadSlashCommands() {
    const dirs = $settings.aiSlashCommandDirs || [];
    if (dirs.length === 0) {
      slashCommands = [];
      slashSuggestions = [];
      return;
    }

    loadingSlashCommands = true;
    try {
      const collected: SlashCommand[] = [];

      for (const dir of dirs) {
        try {
          const children = await readDirectoryChildren(dir, true);
          const commandFiles = children.filter((child) => {
            if (child.is_dir) return false;
            const ext = (child.ext || "").toLowerCase();
            return ext === "md" || ext === "markdown" || ext === "json";
          });

          for (const file of commandFiles) {
            try {
              const content = await readFileText(file.path);
              const ext = (file.ext || "").toLowerCase();
              if (ext === "md" || ext === "markdown") {
                const commandName = normalizeCommandName(file.name.replace(/\.(md|markdown)$/i, ""));
                if (!commandName || !content.trim()) continue;
                const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.replace(/^#+\s*/, "").trim();
                collected.push({
                  name: commandName,
                  prompt: content.trim(),
                  description: firstLine,
                  sourcePath: file.path,
                });
              } else if (ext === "json") {
                try {
                  const parsed = JSON.parse(content);
                  collected.push(...parseJsonSlashCommands(parsed, file.path));
                } catch {
                  // Ignore malformed slash-command JSON files.
                }
              }
            } catch {
              // Skip unreadable files.
            }
          }
        } catch {
          // Skip invalid slash command directory.
        }
      }

      const deduped = new Map<string, SlashCommand>();
      for (const command of collected) {
        deduped.set(command.name, command);
      }
      slashCommands = Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
      updateSlashSuggestions();
    } finally {
      loadingSlashCommands = false;
    }
  }

  $effect(() => {
    $settings.aiSlashCommandDirs;
    void loadSlashCommands();
  });

  function updateSlashSuggestions() {
    if (!textarea) {
      slashSuggestions = [];
      return;
    }

    const cursor = textarea.selectionStart;
    const before = inputText.slice(0, cursor);
    const tokenMatch = before.match(/^\/([^\s]*)$/);
    if (!tokenMatch) {
      slashSuggestions = [];
      slashSelectedIndex = 0;
      return;
    }

    const query = tokenMatch[1].toLowerCase();
    slashSuggestions = slashCommands
      .filter((cmd) => !query || cmd.name.includes(query))
      .slice(0, 8);
    slashSelectedIndex = 0;
  }

  function applySlashCommand(command: SlashCommand) {
    const rest = inputText.replace(/^\/[^\s]*/, "").trimStart();
    inputText = `/${command.name}${rest ? ` ${rest}` : " "}`;
    slashSuggestions = [];

    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = inputText.length;
      if (textarea) {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      }
      autoResize();
    });
  }

  function resolveSlashCommandPayload(text: string): SendPayload | undefined {
    const match = text.match(/^\/([^\s]+)(?:\s+(.*))?$/);
    if (!match) return undefined;

    const commandName = normalizeCommandName(match[1]);
    const command = slashCommands.find((c) => c.name === commandName);
    if (!command) return undefined;

    const args = (match[2] || "").trim();
    return {
      slashCommandName: command.name,
      slashCommandPrompt: command.prompt,
      slashCommandArgs: args,
    };
  }

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
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashSelectedIndex = Math.min(slashSelectedIndex + 1, slashSuggestions.length - 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const selected = slashSuggestions[slashSelectedIndex];
        if (selected) applySlashCommand(selected);
        return;
      }
      if (e.key === "Escape") {
        slashSuggestions = [];
        return;
      }
    }

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
    const slashPayload = resolveSlashCommandPayload(text);
    inputText = "";
    selectedMentions = [];
    mentionSuggestions = [];
    slashSuggestions = [];
    mentionAnchor = -1;
    if (textarea) textarea.style.height = "auto";
    onSend(text, { mentions, ...slashPayload });
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
    updateSlashSuggestions();
  }

  $effect(() => {
    inputText;
    autoResize();
  });
</script>

<div class="px-3 pb-3 pt-2">
  {#if disabled}
    <div class="text-text-muted text-center py-4 bg-bg-secondary/40 rounded-xl border border-border/20" style="font-size: calc(15px * var(--ui-zoom));">
      Set your API key in Settings to get started
    </div>
  {:else}
    <div class="bg-bg-secondary/60 border border-border/30 rounded-xl focus-within:border-accent/30 focus-within:shadow-[0_0_12px_rgba(88,180,208,0.06)] transition-all duration-200">
      {#if selectedMentions.length > 0}
        <div class="px-3 pt-2 flex flex-wrap gap-1.5">
          {#each selectedMentions as mention}
            <button
              class="px-2 py-1 rounded-md bg-accent/15 border border-accent/25 text-accent/90"
              style="font-size: calc(13px * var(--ui-zoom));"
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
          class="w-full bg-transparent text-text-primary resize-none outline-none leading-[1.6] placeholder:text-text-muted/50 px-4 pt-3 pb-2"
          style:font-size="calc(18px * var(--ui-zoom))"
          style="min-height: 3.2em;"
          disabled={isLoading}
        ></textarea>

        {#if mentionSuggestions.length > 0}
          <div class="absolute z-50 left-3 right-3 bottom-[100%] mb-2 rounded-lg border border-border bg-bg-primary/95 max-h-52 overflow-y-auto shadow-2xl">
            {#each mentionSuggestions as suggestion, i (suggestion.path)}
              <button
                class="w-full text-left px-3 py-2 font-mono transition-colors {i === mentionSelectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}"
                style="font-size: calc(14px * var(--ui-zoom));"
                onclick={() => attachMention(suggestion)}
              >
                <span class="opacity-70 mr-1.5">{suggestion.kind === 'folder' ? 'dir' : 'file'}</span>{suggestion.path}
              </button>
            {/each}
          </div>
        {/if}

        {#if slashSuggestions.length > 0}
          <div class="absolute z-50 left-3 right-3 bottom-[100%] mb-2 rounded-lg border border-border bg-bg-primary/95 max-h-52 overflow-y-auto shadow-2xl">
            {#each slashSuggestions as suggestion, i (suggestion.name)}
              <button
                class="w-full text-left px-3 py-2 transition-colors {i === slashSelectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}"
                style="font-size: calc(13px * var(--ui-zoom));"
                onclick={() => applySlashCommand(suggestion)}
                title={suggestion.sourcePath}
              >
                <div class="font-mono">/{suggestion.name}</div>
                {#if suggestion.description}
                  <div class="text-[12px] opacity-70 truncate">{suggestion.description}</div>
                {/if}
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
              class="flex-1 bg-bg-primary border border-border/40 rounded-md px-3 py-1.5 text-text-primary outline-none focus:border-accent/40"
              style="font-size: calc(14.5px * var(--ui-zoom));"
              placeholder="Steer the response. Example: focus only on src/lib"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSteer();
                }
              }}
            />
            <button class="px-2.5 py-1.5 rounded-md bg-accent/20 border border-accent/30 text-accent" style="font-size: calc(13.5px * var(--ui-zoom));" onclick={submitSteer}>Apply</button>
          </div>
        </div>
      {/if}

      <div class="flex items-center justify-between px-3 pb-2.5">
        <div class="text-text-muted/50 select-none" style="font-size: calc(13px * var(--ui-zoom));">
          {#if isLoading}
            Generating...
          {:else if $settings.aiEnableAtMentions}
            Enter to send, @ for files, / for commands
          {:else}
            Enter to send, / for commands
          {/if}
        </div>

        <div class="flex items-center gap-2">
          {#if isLoading}
            <button
              onclick={() => (showSteerBox = !showSteerBox)}
              class="h-10 rounded-lg px-3 border border-accent/25 text-accent/90 hover:bg-accent/10 transition-all"
              style="font-size: calc(13px * var(--ui-zoom));"
              title="Steer response"
            >
              Steer
            </button>
            <button
              onclick={onStop}
              class="w-10 h-10 rounded-lg bg-error/15 border border-error/25 text-error/80 flex items-center justify-center hover:bg-error/25 hover:text-error transition-all"
              title="Stop (Escape)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          {:else}
            <button
              onclick={send}
              disabled={!inputText.trim()}
              class="w-10 h-10 rounded-lg flex items-center justify-center transition-all {inputText.trim() ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/25' : 'text-text-muted/30 cursor-default'}"
              title="Send (Enter)"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
