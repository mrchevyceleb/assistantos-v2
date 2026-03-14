<script lang="ts">
  import { workspacePath } from "$lib/stores/workspace";
  import { settings } from "$lib/stores/settings";
  import { listAllFiles, readDirectoryChildren, readFileText } from "$lib/utils/tauri";

  interface ImageAttachment {
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    base64: string;
  }

  interface SendPayload {
    mentions?: string[];
    steer?: string;
    images?: ImageAttachment[];
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
    /** Extra slash commands injected by parent (e.g. Claude Code CLI commands) */
    extraSlashCommands?: string[];
  }

  let { onSend, onStop, onSteer, isLoading, disabled, extraSlashCommands = [] }: Props = $props();
  let inputText = $state("");
  let textarea = $state<HTMLTextAreaElement | null>(null);

  let attachedImages = $state<ImageAttachment[]>([]);

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

    listAllFiles(root, $settings.showHiddenFiles)
      .then((files) => {
        const folders = new Set<string>();
        const mentionItems: Array<{ path: string; kind: "file" | "folder" }> = [];

        for (const file of files.slice(0, 5000)) {
          const filePath = file.relative_path.replace(/\\/g, "/");
          mentionItems.push({ path: filePath, kind: "file" });

          const parts = filePath.split("/").filter(Boolean);
          for (let i = 1; i < parts.length; i += 1) {
            folders.add(parts.slice(0, i).join("/"));
          }
        }

        for (const folder of folders) {
          mentionItems.push({ path: folder, kind: "folder" });
        }

        const deduped = new Map<string, { path: string; kind: "file" | "folder" }>();
        for (const item of mentionItems) {
          const existing = deduped.get(item.path);
          if (!existing || existing.kind === "file") {
            deduped.set(item.path, item);
          }
        }
        allMentions = Array.from(deduped.values());
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
    const dirs = [...($settings.aiSlashCommandDirs || [])];

    // Auto-discover project-local .claude/commands/
    const ws = $workspacePath;
    if (ws) {
      const sep = ws.includes("\\") ? "\\" : "/";
      const projectCmds = `${ws}${sep}.claude${sep}commands`;
      if (!dirs.includes(projectCmds)) dirs.push(projectCmds);
    }

    // Auto-discover global ~/.claude/commands/
    try {
      const homeDir = await import("@tauri-apps/api/path").then(m => m.homeDir());
      if (homeDir) {
        const sep = homeDir.includes("\\") ? "\\" : "/";
        const globalCmds = `${homeDir.replace(/[\\/]+$/, "")}${sep}.claude${sep}commands`;
        if (!dirs.includes(globalCmds)) dirs.push(globalCmds);
      }
    } catch {
      // homeDir not available
    }

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
    $workspacePath;
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

    // Merge file-based commands with extra CLI commands
    const allCommands = [...slashCommands];
    for (const name of extraSlashCommands) {
      if (!allCommands.some((c) => c.name === name)) {
        allCommands.push({ name, prompt: "", description: "Claude Code command", sourcePath: "" });
      }
    }

    slashSuggestions = allCommands
      .filter((cmd) => !query || cmd.name.includes(query))
      .slice(0, 12);
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
      if (!disabled) {
        if (isLoading && inputText.trim()) {
          // Send as steering message (interrupts current AI run)
          const text = inputText.trim();
          inputText = "";
          attachedImages = [];
          if (textarea) textarea.style.height = "auto";
          onSteer(text);
        } else if (!isLoading && (inputText.trim() || attachedImages.length > 0)) {
          send();
        }
      }
    }
    if (e.key === "Escape" && isLoading) {
      e.preventDefault();
      onStop();
    }
  }

  function send() {
    const text = inputText.trim();
    if (!text && attachedImages.length === 0) return;
    const mentions = selectedMentions.length > 0 ? [...selectedMentions] : undefined;
    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;
    const slashPayload = resolveSlashCommandPayload(text);
    inputText = "";
    selectedMentions = [];
    attachedImages = [];
    mentionSuggestions = [];
    slashSuggestions = [];
    mentionAnchor = -1;
    if (textarea) textarea.style.height = "auto";
    onSend(text || "(image attached)", { mentions, images, ...slashPayload });
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

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const mediaType = file.type as ImageAttachment['mediaType'];
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            attachedImages = [...attachedImages, { mediaType, base64 }];
          }
        };
        reader.readAsDataURL(file);
        return; // Only handle the first image
      }
    }
  }

  function removeImage(index: number) {
    attachedImages = attachedImages.filter((_, i) => i !== index);
  }

  let dragOver = $state(false);

  function handleDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('application/x-filetree-path')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dragOver = true;
    }
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    dragOver = false;
    if (!e.dataTransfer) return;
    const absPath = e.dataTransfer.getData('application/x-filetree-path');
    if (!absPath) return;
    e.preventDefault();

    // Compute relative path from workspace root
    const root = $workspacePath;
    let relPath = absPath;
    if (root) {
      const normalized = absPath.replace(/\\/g, '/');
      const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normalized.startsWith(normalizedRoot)) {
        relPath = normalized.slice(normalizedRoot.length).replace(/^\//, '');
      }
    }

    // Insert as @mention at cursor position
    const mention = `@${relPath} `;
    if (textarea) {
      const cursor = textarea.selectionStart;
      inputText = inputText.slice(0, cursor) + mention + inputText.slice(cursor);
      if (!selectedMentions.includes(relPath)) {
        selectedMentions = [...selectedMentions, relPath];
      }
      requestAnimationFrame(() => {
        const newCursor = cursor + mention.length;
        textarea?.focus();
        if (textarea) {
          textarea.selectionStart = newCursor;
          textarea.selectionEnd = newCursor;
        }
        autoResize();
      });
    } else {
      inputText += mention;
      if (!selectedMentions.includes(relPath)) {
        selectedMentions = [...selectedMentions, relPath];
      }
    }
  }

  $effect(() => {
    inputText;
    autoResize();
  });
</script>

<div style="padding: 16px 16px 14px 16px;">
  {#if disabled}
    <div class="text-text-muted text-center bg-bg-secondary/40 rounded-xl border border-border/20" style="font-size: calc(15px * var(--ui-zoom)); padding: 16px 0;">
      Set your API key in Settings to get started
    </div>
  {:else}
    <div class="bg-bg-secondary/60 border border-border/30 rounded-xl focus-within:border-accent/30 focus-within:shadow-[0_0_12px_rgba(88,180,208,0.06)] transition-all duration-200">
      {#if attachedImages.length > 0}
        <div class="flex flex-wrap" style="padding: 10px 12px 0 12px; gap: 8px;">
          {#each attachedImages as img, i}
            <div class="relative group">
              <img
                src="data:{img.mediaType};base64,{img.base64}"
                alt="Attached screenshot"
                class="h-16 max-w-[120px] object-cover rounded-md border border-border/40"
              />
              <button
                class="absolute rounded-full bg-error/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style="top: -6px; right: -6px; width: 20px; height: 20px; font-size: 11px;"
                onclick={() => removeImage(i)}
                title="Remove image"
              >×</button>
            </div>
          {/each}
        </div>
      {/if}

      {#if selectedMentions.length > 0}
        <div class="flex flex-wrap" style="padding: 8px 12px 0 12px; gap: 6px;">
          {#each selectedMentions as mention}
            <button
              class="rounded-md bg-accent/15 border border-accent/25 text-accent/90"
              style="padding: 4px 8px; font-size: calc(13px * var(--ui-zoom));"
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
          onpaste={handlePaste}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
          placeholder={isLoading ? "Type to steer the AI... (Enter to send)" : "Ask about your workspace... Use @ to tag files, or drag files here"}
          rows="2"
          class="w-full bg-transparent text-text-primary resize-none outline-none leading-[1.6] placeholder:text-text-muted/50"
          class:drop-highlight={dragOver}
          style="padding: 14px 18px 10px 18px; font-size: calc(18px * var(--ui-zoom)); min-height: 3.2em;"
        ></textarea>

        {#if mentionSuggestions.length > 0}
          <div class="absolute z-50 rounded-lg border border-border bg-bg-primary/95 max-h-52 overflow-y-auto shadow-2xl" style="left: 12px; right: 12px; bottom: 100%; margin-bottom: 8px;">
            {#each mentionSuggestions as suggestion, i (suggestion.path)}
              <button
                class="w-full text-left font-mono transition-colors {i === mentionSelectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}"
                style="font-size: calc(14px * var(--ui-zoom)); padding: 8px 12px;"
                onclick={() => attachMention(suggestion)}
              >
                <span style="opacity: 0.7; margin-right: 6px;">{suggestion.kind === 'folder' ? 'dir' : 'file'}</span>{suggestion.path}
              </button>
            {/each}
          </div>
        {/if}

        {#if slashSuggestions.length > 0}
          <div class="absolute z-50 rounded-lg border border-border bg-bg-primary/95 max-h-52 overflow-y-auto shadow-2xl" style="left: 12px; right: 12px; bottom: 100%; margin-bottom: 8px;">
            {#each slashSuggestions as suggestion, i (suggestion.name)}
              <button
                class="w-full text-left transition-colors {i === slashSelectedIndex ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}"
                style="padding: 8px 12px; font-size: calc(13px * var(--ui-zoom));"
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

      <div class="flex items-center justify-between" style="padding: 0 12px 10px 12px;">
        <div class="text-text-muted/50 select-none" style="font-size: calc(13px * var(--ui-zoom));">
          {#if isLoading}
            <span class="working-indicator" role="status" aria-label="Assistant is working">
              <span class="working-bars" aria-hidden="true"><span></span><span></span><span></span></span>
              <span>Working... type to steer</span>
            </span>
          {:else if $settings.aiEnableAtMentions}
            Enter to send, @ for files, / for commands
          {:else}
            Enter to send, / for commands
          {/if}
        </div>

        <div class="flex items-center" style="gap: 8px;">
          {#if isLoading}
            {#if inputText.trim()}
              <button
                onclick={() => {
                  const text = inputText.trim();
                  inputText = "";
                  attachedImages = [];
                  if (textarea) textarea.style.height = "auto";
                  onSteer(text);
                }}
                class="w-10 h-10 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 border border-accent/25 flex items-center justify-center transition-all"
                title="Send to steer (Enter)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            {/if}
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
              disabled={!inputText.trim() && attachedImages.length === 0}
              class="w-10 h-10 rounded-lg flex items-center justify-center transition-all {inputText.trim() || attachedImages.length > 0 ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/25' : 'text-text-muted/30 cursor-default'}"
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

<style>
  .drop-highlight {
    background: rgba(88, 180, 208, 0.08);
    box-shadow: inset 0 0 0 2px rgba(88, 180, 208, 0.4);
    border-radius: 8px;
  }

  .working-indicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
  }

  .working-bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }

  .working-bars span {
    width: 3px;
    border-radius: 999px;
    background: rgba(88, 180, 208, 0.85);
    animation: working-bars 0.85s ease-in-out infinite;
  }

  .working-bars span:nth-child(1) {
    height: 5px;
    animation-delay: 0s;
  }

  .working-bars span:nth-child(2) {
    height: 10px;
    animation-delay: 0.15s;
  }

  .working-bars span:nth-child(3) {
    height: 7px;
    animation-delay: 0.3s;
  }

  @keyframes working-bars {
    0%,
    100% {
      transform: scaleY(0.65);
      opacity: 0.45;
    }
    50% {
      transform: scaleY(1.15);
      opacity: 1;
    }
  }
</style>
