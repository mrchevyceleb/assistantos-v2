# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AssistantOS is a desktop workspace/file-manager application built with **Tauri 2** (Rust backend) + **SvelteKit 5** (Svelte 5 + TypeScript frontend) + **TailwindCSS 4**. It renders as a single-page app via `adapter-static`.

## Development Commands

```bash
# Run dev mode (starts Vite dev server on :1420 + Tauri window)
npm run tauri dev

# Build production desktop app
npm run tauri build

# Type-check the frontend
npm run check

# Frontend-only dev server (no Tauri window)
npm run dev
```

There is no test suite configured. No linter is configured.

## Architecture

### Two-Process Model

**Rust backend** (`src-tauri/src/lib.rs`) — single file containing all Tauri command handlers:
- File system operations (read/write/delete/rename/search/tree)
- PTY terminal management via `portable-pty` (spawn/write/resize/close)
- Claude Code process management (spawn/close per-message processes)
- Filesystem watcher via `notify` crate (emits `fs-change` events)
- App state persistence to `{app_data_dir}/assistantos-state.json`

**SvelteKit frontend** (`src/`) — SPA mode, no SSR:
- All Tauri IPC calls go through `src/lib/utils/tauri.ts` (typed wrappers around `invoke()`)
- State managed via Svelte stores in `src/lib/stores/`
- Components in `src/lib/components/`

### IPC Bridge

`src/lib/utils/tauri.ts` is the sole bridge between frontend and Rust. Every Rust `#[tauri::command]` has a corresponding typed async function here. When adding new Tauri commands:
1. Add the `#[tauri::command]` function in `lib.rs`
2. Register it in the `invoke_handler![]` macro in `run()`
3. Add a typed wrapper in `tauri.ts`

### Stores (Svelte writable/derived stores)

| Store | Purpose |
|-------|---------|
| `workspace.ts` | Current workspace path, file tree, sidebar state |
| `tabs.ts` | Tab lifecycle (open/close/reorder), active tab, edit mode toggle |
| `terminal.ts` | Terminal instances with dock positions (bottom/tab/right) |
| `ui.ts` | UI zoom level (0.6x-2.0x), persisted to localStorage |
| `claude-code.ts` | Claude Code CLI sessions, message parsing, context tracking |
| `persistence.ts` | Auto-save (1s debounce) of full app state to Tauri backend |

### Content Viewers

`ContentArea.svelte` dispatches to the appropriate viewer based on `tab.viewerType`, which is determined by file extension in `src/lib/utils/file-types.ts`. Viewer types: `markdown`, `html`, `image`, `video`, `pdf`, `code`, `text`, `terminal`, `chat`, `claude-code`.

- Code editing uses **CodeMirror 6** (`CodeEditor.svelte`)
- Markdown rendering uses the **unified** pipeline (remark-parse -> remark-gfm -> remark-rehype -> shiki highlighting -> rehype-stringify)
- Terminals use **xterm.js** backed by Rust PTY sessions

### Terminal System

Terminals have a unique architecture: each terminal instance has a `dock` property (`bottom` | `tab` | `right`) determining where it renders. The Rust backend maintains a `HashMap<String, PtySession>` keyed by terminal ID. A reader thread per session emits `terminal-output` events to the frontend. Terminal containers stay always-mounted to preserve PTY state.

### Claude Code Integration

Claude Code runs as an embedded panel inside AssistantOS, using the CLI's `--output-format stream-json` protocol. No API keys needed. It uses the user's existing Claude Code subscription.

**Architecture**: Per-message process spawning. Each user message spawns a fresh `claude -p "message" --output-format stream-json --verbose --dangerously-skip-permissions` process. Multi-turn conversations use `--resume SESSION_ID` (captured from the init event) to continue the CLI session.

**Rust backend** (`lib.rs`): `ClaudeCodeState` manages a `HashMap<String, ClaudeCodeProcess>`. `spawn_claude_code` spawns the process with piped stdout/stderr, reader threads emit `claude-code-output` events (newline-delimited JSON). Processes auto-clean from the HashMap on natural exit (stdout EOF), with proper child reaping via `wait()`.

**Store** (`claude-code.ts`): Parses JSON events from the CLI into typed messages. Tracks session state (ready/running/error), context usage (tokens vs window), model, cost, and available slash commands. All store updates create new session objects (not mutations) for Svelte 5 `$derived` referential equality.

**UI** (`src/lib/components/claude-code/`):
- `ClaudeCodePanel.svelte` - Main panel with header (model switcher, context bar, status, settings)
- `ClaudeCodeMessage.svelte` - Renders messages with markdown (shared `renderMarkdown` + `chat-prose` styles), tool call blocks, result summaries
- Reuses `ChatInput.svelte` for input (@ mentions, slash commands, steering, image paste, drag-drop)
- Always-mounted in `ContentArea.svelte` to preserve session state across tab switches
- Launched via right-click context menu on tab bar or empty area

**Key details**:
- Synthetic tab paths: `__claude-code__:{id}`
- Model switcher passes `--model` flag on next spawn
- Context window: Opus = 1M tokens, Sonnet/Haiku = 200K. Parsed from `[1m]` suffix in model string.
- CLI slash commands captured from init event's `slash_commands` array and merged into ChatInput autocomplete
- `ChatInput` auto-discovers slash commands from `{workspacePath}/.claude/commands/` and `~/.claude/commands/`
- HTML sanitization strips event handler attributes before `{@html}` injection
- Async markdown render uses version guard to prevent stale content

### Event Flow

- **File watcher**: Rust `notify` -> `fs-change` event -> frontend debounces (500ms) -> refreshes tree + reloads open tabs (skips unsaved)
- **Terminal I/O**: User types -> `writeTerminal()` -> Rust PTY -> reader thread -> `terminal-output` event -> xterm.js
- **Claude Code**: User sends message -> `spawnClaudeCode()` -> Rust spawns `claude -p` -> stdout reader thread -> `claude-code-output` events -> store parses JSON -> UI renders messages
- **Persistence**: Store changes -> subscription -> debounced (1s) -> `saveAppState()` -> Rust writes JSON

### File Tree Filtering

The Rust backend filters these directories from the tree: `.git`, `node_modules`, `.svelte-kit`, `.next`, `.nuxt`, `.vscode`, `.idea`, `__pycache__`, `.DS_Store`, `target`, `dist`, `.playwright-mcp`, `.vault-pilot`, `build`. Defined as `HIDDEN_DIRS` in `lib.rs`.

## TailwindCSS 4 Gotcha: Broken Utility Classes

TailwindCSS 4's JIT content detection (via Vite module graph) is **unreliable** in this project. Utility classes like `px-3`, `py-2`, `pr-8`, `pt-4`, `mb-1` etc. can be present in the HTML but have **zero computed effect** because Tailwind never generates the corresponding CSS rules.

**Always use inline `style` attributes for spacing (padding, margin, gap, width, height) instead of Tailwind utility classes.** This has been verified with Playwright browser inspection. Tailwind classes for colors, borders, flex, display, and other non-spacing properties generally work fine.

Bad (may silently fail):
```svelte
<div class="px-3 py-2 mt-4">
```

Good (guaranteed to work):
```svelte
<div style="padding: 8px 12px; margin-top: 16px;">
```

This applies especially to the chat components (`ChatPanel`, `ChatMessage`, `ChatInput`) but may affect any component. When debugging UI spacing issues, always verify with Playwright browser inspection (`window.getComputedStyle()`) that the CSS is actually being applied.

## Key Patterns

- **SPA-only**: `adapter-static` with `fallback: "index.html"`. No server-side rendering.
- **Vite dev server**: Port 1420, HMR on 1421. Ignores `src-tauri/` in watch.
- **Tab deduplication**: Opening an already-open file activates the existing tab instead of creating a new one.
- **Terminal tabs**: Use synthetic paths `__terminal__:{id}` to integrate terminals into the tab bar.
- **Claude Code tabs**: Use synthetic paths `__claude-code__:{id}` with per-message process spawning and `--resume` for multi-turn.
- **Encoding fallback**: Rust file reading tries UTF-8 first, falls back to `encoding_rs` detection.

## Releases and Auto-Updates

**GitHub repo**: `mrchevyceleb/assistantos-v2` (public)

**Auto-updater** is built in via `tauri-plugin-updater`. The app checks GitHub releases on launch (3s delay) and every 30 minutes. The `UpdateNotification.svelte` component handles the UI toast. Update manifests are served from the `latest.json` asset attached to each GitHub release.

### Signing

Updater uses a minisign keypair:
- **Private key**: `TAURI_SIGNING_PRIVATE_KEY` GitHub secret
- **Password**: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secret (must be a real non-empty password, NOT empty string. GitHub Actions cannot store empty secrets)
- **Public key**: `tauri.conf.json` -> `plugins.updater.pubkey`
- **Local backup**: `src-tauri/keys/assistantos.key` and `.key.pub` (gitignored)

If the signing key ever needs regenerating:
1. `npx tauri signer generate --ci -p "YOUR_PASSWORD" -w src-tauri/keys/assistantos.key`
2. Update `TAURI_SIGNING_PRIVATE_KEY` secret: `cat src-tauri/keys/assistantos.key | gh secret set TAURI_SIGNING_PRIVATE_KEY`
3. Update `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret: `echo -n "YOUR_PASSWORD" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
4. Update pubkey in `tauri.conf.json` -> `plugins.updater.pubkey` with contents of `.key.pub`

### Critical config: `createUpdaterArtifacts`

`tauri.conf.json` -> `bundle.createUpdaterArtifacts` MUST be set to `"v1Compatible"`. Without this, the Tauri v2 CLI will NOT generate `.nsis.zip`, `.nsis.zip.sig`, `.app.tar.gz`, or `.app.tar.gz.sig` files needed for the auto-updater. These are the updater bundles the `latest.json` manifest points to.

### Release workflow architecture

The workflow (`.github/workflows/release.yml`) does NOT use `tauri-apps/tauri-action`. It builds directly with `npx tauri build` because tauri-action has bugs with uploading updater artifacts. The workflow has three jobs:

1. **build-windows**: `npx tauri build` on windows-latest, uploads `.exe` + `.nsis.zip` + `.nsis.zip.sig` as GitHub Actions artifacts
2. **build-macos**: `npx tauri build --target universal-apple-darwin` on macos-latest, uploads `.dmg` + `.app.tar.gz` + `.app.tar.gz.sig` as artifacts
3. **publish**: Downloads all artifacts, creates the GitHub release, uploads all files, reads `.sig` files from disk to build `latest.json` with platform entries, then publishes

### Release process

**IMPORTANT: Always ask the user before creating a release.** After finishing work, ask: "Want me to cut a release with these changes?" Do NOT tag or push a release without explicit approval.

Steps to release:
1. Bump the version in all three places (must match):
   - `tauri.conf.json` -> `version`
   - `package.json` -> `version`
   - `src-tauri/Cargo.toml` -> `version`
2. Commit the version bump
3. Tag: `git tag v{version}`
4. Push: `git push origin master && git push origin v{version}`
5. GitHub Actions handles the rest automatically (~12-15 min):
   - Builds Windows (x64) and macOS (universal) in parallel
   - Creates release with all installers + updater bundles + `latest.json`
   - `latest.json` has populated `platforms` with signatures and download URLs

### Build targets

| Platform | Runner | Installer | Updater bundle |
|----------|--------|-----------|----------------|
| Windows x64 | `windows-latest` | `.exe` (NSIS) | `.nsis.zip` + `.nsis.zip.sig` |
| macOS Universal | `macos-latest` | `.dmg` | `.app.tar.gz` + `.app.tar.gz.sig` |

### Troubleshooting releases

- **"Wrong password for that key"**: The `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret is wrong or missing. Regenerate the key pair (see Signing section above).
- **Empty `platforms` in latest.json**: The `.nsis.zip`/`.sig` files weren't generated. Ensure `createUpdaterArtifacts: "v1Compatible"` is in `tauri.conf.json` bundle config.
- **Build fails silently**: Check the "List build artifacts" step output to see what files were actually generated in the bundle directories.
