<script lang="ts">
  import { onMount } from "svelte";
  import { check } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";

  let updateAvailable = $state(false);
  let updateVersion = $state("");
  let isDownloading = $state(false);
  let downloadProgress = $state(0);
  let isInstalling = $state(false);
  let error = $state("");

  onMount(() => {
    // Check for updates 3 seconds after launch, then every 30 minutes
    const initialTimeout = setTimeout(() => checkForUpdate(), 3000);
    const interval = setInterval(() => checkForUpdate(), 30 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  });

  async function checkForUpdate() {
    try {
      const update = await check();
      if (update) {
        updateAvailable = true;
        updateVersion = update.version;

        // Store the update reference for later download
        (window as any).__tauriUpdate = update;
      }
    } catch (e) {
      console.warn("Update check failed:", e);
    }
  }

  async function installUpdate() {
    const update = (window as any).__tauriUpdate;
    if (!update) return;

    try {
      isDownloading = true;
      error = "";

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            downloadProgress = Math.round((downloadedBytes / totalBytes) * 100);
          }
        } else if (event.event === "Finished") {
          isDownloading = false;
          isInstalling = true;
        }
      });

      // Relaunch the app after install
      await relaunch();
    } catch (e: any) {
      isDownloading = false;
      isInstalling = false;
      error = e?.message || "Update failed";
      console.error("Update failed:", e);
    }
  }

  function dismiss() {
    updateAvailable = false;
  }
</script>

{#if updateAvailable}
  <div class="fixed bottom-12 right-4 z-50 max-w-sm">
    <div class="glass-panel rounded-lg p-4 shadow-lg border border-border-light">
      {#if error}
        <div class="flex items-start gap-3">
          <div class="flex-1">
            <p class="text-sm font-medium text-error">Update failed</p>
            <p class="text-xs text-secondary mt-1">{error}</p>
          </div>
          <button onclick={dismiss} class="text-tertiary hover:text-primary text-lg leading-none">&times;</button>
        </div>
      {:else if isInstalling}
        <div class="flex items-center gap-3">
          <div class="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full"></div>
          <p class="text-sm text-primary">Installing update...</p>
        </div>
      {:else if isDownloading}
        <div>
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-primary">Downloading v{updateVersion}...</p>
            <span class="text-xs text-secondary">{downloadProgress}%</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              style="width: {downloadProgress}%; background: var(--color-accent);"
            ></div>
          </div>
        </div>
      {:else}
        <div class="flex items-start gap-3">
          <div class="flex-1">
            <p class="text-sm font-medium text-primary">Update available</p>
            <p class="text-xs text-secondary mt-1">Version {updateVersion} is ready to install.</p>
          </div>
          <button onclick={dismiss} class="text-tertiary hover:text-primary text-lg leading-none">&times;</button>
        </div>
        <div class="flex gap-2 mt-3">
          <button
            onclick={installUpdate}
            class="px-3 py-1.5 text-xs font-medium rounded-md"
            style="background: var(--color-accent); color: var(--color-bg-primary);"
          >
            Update now
          </button>
          <button
            onclick={dismiss}
            class="px-3 py-1.5 text-xs font-medium rounded-md text-secondary hover:text-primary"
            style="background: var(--color-bg-secondary);"
          >
            Later
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
