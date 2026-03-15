import { writable } from "svelte/store";

// ── Types ────────────────────────────────────────────────────────────

export interface AppSettings {
  defaultTerminalDock: "bottom" | "right" | "tab" | "left";
  terminalStylePreset: "metal" | "minimal" | "retro" | "high-contrast";
  defaultShell: "auto" | "powershell" | "bash" | "cmd";
  terminalFontSize: number;
  terminalCursorStyle: "block" | "underline" | "bar";
  editorFontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSaveDelay: number;
  theme: string;
  showHiddenFiles: boolean;
  fileTreeFontSize: number;
  restoreSession: boolean;
  confirmCloseUnsaved: boolean;
  aiProvider: "openrouter" | "anthropic" | "openai" | "lmstudio";
  aiAuthMode: "apiKey" | "oauth";
  aiApiKey: string;
  aiOpenRouterApiKey: string;
  aiAnthropicApiKey: string;
  aiOpenAIApiKey: string;
  aiOpenAIOAuthAccessToken: string;
  aiOpenAIOAuthRefreshToken: string;
  aiOpenAIOAuthExpiresAt: string;
  aiModel: string;
  aiBaseUrl: string;
  aiOpenRouterBaseUrl: string;
  aiAnthropicBaseUrl: string;
  aiOpenAIBaseUrl: string;
  aiOpenAICodexBaseUrl: string;
  aiOpenAICodexClientVersion: string;
  aiLMStudioBaseUrl: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiMaxContextTokens: number;
  aiReasoningEnabled: boolean;
  aiReasoningMaxBudgetTokens: number;
  aiReasoningExclude: boolean;
  aiEnableToolUse: boolean;
  aiConfirmWrites: boolean;
  aiYoloMode: boolean;
  aiMaxToolIterations: number;
  aiEnabledModels: string[];
  aiChatFontSize: number;
  aiChatFontFamily: string;
  aiChatDock: "right" | "bottom" | "tab";
  aiReadInstructionsEveryMessage: boolean;
  aiEnableAtMentions: boolean;
  aiSlashCommandDirs: string[];
  aiBasePrompt: string;
  aiThinkingMode: "all" | "preview" | "none";
  mcpServers: MCPServerConfig[];
}

export interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  timeoutMs: number;
  transport: 'http' | 'stdio';
  // HTTP fields
  url: string;
  authToken: string;
  headersJson: string;
  // Stdio fields
  command: string;
  args: string[];
  env: Record<string, string>;
}

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTerminalDock: "bottom",
  terminalStylePreset: "metal",
  defaultShell: "auto",
  terminalFontSize: 14,
  terminalCursorStyle: "bar",
  editorFontSize: 14,
  tabSize: 2,
  wordWrap: false,
  autoSaveDelay: 2000,
  theme: "catppuccin-mocha",
  showHiddenFiles: false,
  fileTreeFontSize: 14,
  restoreSession: true,
  confirmCloseUnsaved: true,
  aiProvider: "openrouter",
  aiAuthMode: "apiKey",
  aiApiKey: '',
  aiOpenRouterApiKey: '',
  aiAnthropicApiKey: '',
  aiOpenAIApiKey: '',
  aiOpenAIOAuthAccessToken: '',
  aiOpenAIOAuthRefreshToken: '',
  aiOpenAIOAuthExpiresAt: '',
  aiModel: 'anthropic/claude-sonnet-4-6',
  aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiOpenRouterBaseUrl: 'https://openrouter.ai/api/v1',
  aiAnthropicBaseUrl: 'https://api.anthropic.com/v1',
  aiOpenAIBaseUrl: 'https://api.openai.com/v1',
  aiOpenAICodexBaseUrl: 'https://chatgpt.com/backend-api/codex',
  aiOpenAICodexClientVersion: '4.0.0',
  aiLMStudioBaseUrl: 'http://localhost:1234/v1',
  aiTemperature: 0.7,
  aiMaxTokens: 16384,
  aiMaxContextTokens: 128000,
  aiReasoningEnabled: false,
  aiReasoningMaxBudgetTokens: 20000,
  aiReasoningExclude: false,
  aiEnableToolUse: true,
  aiConfirmWrites: true,
  aiYoloMode: false,
  aiMaxToolIterations: 75,
  aiChatFontSize: 15,
  aiChatFontFamily: 'system',
  aiChatDock: "bottom",
  aiReadInstructionsEveryMessage: false,
  aiEnableAtMentions: true,
  aiSlashCommandDirs: [],
  aiBasePrompt: 'default',
  aiThinkingMode: "preview",
  aiEnabledModels: [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.4',
    'openai/gpt-5.3-codex-medium',
    'openai/gpt-5.3-codex',
    'openai/gpt-5.3-codex-spark',
    'google/gemini-2.5-pro-preview',
  ],
  mcpServers: [],
};

// ── Stores ───────────────────────────────────────────────────────────

export const settings = writable<AppSettings>({ ...DEFAULT_SETTINGS });

/** Whether the settings modal is visible */
export const settingsVisible = writable(false);

/** Whether the AI settings page is visible */
export const aiSettingsVisible = writable(false);

// ── Helpers ──────────────────────────────────────────────────────────

/** Update a single setting by key */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) {
  settings.update((s) => ({ ...s, [key]: value }));
}

export function getActiveAIKey(s: AppSettings): string {
  if (s.aiProvider === "anthropic") return (s.aiAnthropicApiKey || "").trim();
  if (s.aiProvider === "openai") {
    const oauthToken = (s.aiOpenAIOAuthAccessToken || "").trim();
    if (oauthToken) return oauthToken;
    return (s.aiOpenAIApiKey || "").trim();
  }
  if (s.aiProvider === "lmstudio") return "lm-studio";
  return (s.aiOpenRouterApiKey || s.aiApiKey || "").trim();
}

/** Human-readable provider name from provider ID */
export function getProviderDisplayName(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'Anthropic';
    case 'openrouter': return 'OpenRouter';
    case 'openai': return 'OpenAI';
    case 'lmstudio': return 'LM Studio';
    default: return provider;
  }
}

/**
 * Infer which provider a model ID belongs to based on its format.
 * Models with known prefixes (anthropic/, openai/, google/, etc.) are OpenRouter-routed
 * unless the active provider is LM Studio.
 */
export function inferProviderForModel(
  modelId: string,
  activeProvider?: AppSettings['aiProvider'],
): string {
  const id = (modelId || '').toLowerCase();
  if (activeProvider === 'lmstudio') return 'LM Studio';

  if (id.startsWith('anthropic/')) return activeProvider === 'openrouter' ? 'Anthropic via OpenRouter' : 'Anthropic';
  if (id.startsWith('openai/')) return activeProvider === 'openrouter' ? 'OpenAI via OpenRouter' : 'OpenAI';
  if (id.startsWith('google/')) return 'Google via OpenRouter';
  if (id.startsWith('mistralai/')) return 'Mistral via OpenRouter';
  if (id.startsWith('deepseek/')) return 'DeepSeek via OpenRouter';

  if (id.startsWith('claude-')) return 'Anthropic';
  if (id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('codex-')) return 'OpenAI';

  // Any model with a prefix/ format (e.g. qwen/, meta-llama/, cohere/) is an OpenRouter model
  if (id.includes('/')) {
    const prefix = id.split('/')[0];
    const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return `${label} via OpenRouter`;
  }

  if (activeProvider) return getProviderDisplayName(activeProvider);
  return 'Unknown';
}

/** Infer routing provider from model ID. */
export function inferRoutingProviderForModel(
  modelId: string,
  fallback: AppSettings['aiProvider'] = 'openrouter',
): AppSettings['aiProvider'] {
  const id = (modelId || '').toLowerCase();
  if (!id) return fallback;

  if (id.startsWith('anthropic/') || id.startsWith('claude-')) return 'anthropic';
  if (id.startsWith('openai/') || id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('codex-')) return 'openai';

  // Any model with a prefix/ format (e.g. qwen/, google/, meta-llama/) routes through OpenRouter,
  // unless the current fallback is lmstudio (LM Studio also uses org/model IDs)
  if (id.includes('/') && fallback !== 'lmstudio') return 'openrouter';

  return fallback;
}

export function getActiveAIBaseUrl(s: AppSettings): string {
  if (s.aiProvider === "anthropic") {
    return (s.aiAnthropicBaseUrl || "https://api.anthropic.com/v1").trim();
  }
  if (s.aiProvider === "openai") {
    const oauthToken = (s.aiOpenAIOAuthAccessToken || "").trim();
    if (oauthToken) {
      // Only use Codex backend URL for codex models; standard models use the regular OpenAI API
      const model = (s.aiModel || "").toLowerCase();
      if (model.includes("codex")) {
        return (s.aiOpenAICodexBaseUrl || 'https://chatgpt.com/backend-api/codex').trim();
      }
      return (s.aiOpenAIBaseUrl || "https://api.openai.com/v1").trim();
    }
    return (s.aiOpenAIBaseUrl || "https://api.openai.com/v1").trim();
  }
  if (s.aiProvider === "lmstudio") {
    return (s.aiLMStudioBaseUrl || "http://localhost:1234/v1").trim();
  }
  return (s.aiOpenRouterBaseUrl || s.aiBaseUrl || "https://openrouter.ai/api/v1").trim();
}
