import { writable, get } from 'svelte/store';
import { aiFetchModels, aiLMStudioLoadModel, aiLMStudioUnloadModel } from '$lib/utils/tauri';
import { settings, getActiveAIBaseUrl, getActiveAIKey, updateSetting } from './settings';
import { inferModelSettings } from '$lib/ai/model-registry';

export interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt: string; completion: string };
}

/** Prefixes for well-known providers to surface in the "Top Providers" section */
export const TOP_PROVIDERS = [
  'anthropic/',
  'openai/',
  'google/',
  'mistralai/',
  'deepseek/',
  'qwen/',
  'meta-llama/',
  'z-ai/',
  'minimax/',
  'moonshotai/',
];

export const availableModels = writable<OpenRouterModel[]>([]);
export const modelsLoading = writable(false);
export const modelsError = writable<string | null>(null);
export const modelsLastFetched = writable<number>(0);

export const ANTHROPIC_MODELS: OpenRouterModel[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', context_length: 200000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context_length: 200000 },
  { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', context_length: 200000 },
];

export const OPENAI_MODELS: OpenRouterModel[] = [
  { id: 'gpt-5.4', name: 'GPT 5.4', context_length: 400000 },
  { id: 'gpt-5.3-codex-medium', name: 'Codex 5.3 Medium', context_length: 400000 },
  { id: 'gpt-5.3-codex', name: 'Codex 5.3 High', context_length: 400000 },
  { id: 'gpt-5.3-codex-spark', name: 'Codex Spark', context_length: 400000 },
];

export const lmStudioStatus = writable<'connected' | 'disconnected' | 'checking'>('disconnected');
export const lmStudioModels = writable<OpenRouterModel[]>([]);
export const lmStudioError = writable<string | null>(null);
export const lmStudioActiveInstanceId = writable<string | null>(null);
export const lmStudioLoadedModel = writable<string | null>(null);

function titleCaseWords(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function prettifyModelId(modelId: string): string {
  const short = modelId.split('/').pop() || modelId;
  if (short === 'gemini-2.5-pro-preview') return 'Gemini 2.5 Pro';
  if (short === 'gemini-2.5-flash-preview') return 'Gemini 2.5 Flash';
  if (short === 'gpt-5.4') return 'GPT 5.4';
  if (short === 'gpt-5.3-codex-medium') return 'Codex 5.3 Medium';
  if (short === 'gpt-5.3-codex') return 'Codex 5.3 High';
  if (short === 'gpt-5.3-codex-spark') return 'Codex Spark';
  if (short === 'gpt-4.1') return 'GPT-4.1';
  if (short === 'gpt-4.1-mini') return 'GPT-4.1 Mini';
  if (short === 'o4-mini') return 'o4 Mini';
  if (short === 'o3') return 'o3';
  if (short === 'claude-opus-4-6') return 'Claude Opus 4.6';
  if (short === 'claude-sonnet-4-6') return 'Claude Sonnet 4.6';
  if (short === 'claude-3-5-haiku-latest') return 'Claude 3.5 Haiku';

  const normalized = short
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return titleCaseWords(normalized);
}

export function getModelDisplayName(model: Pick<OpenRouterModel, 'id' | 'name'> | string): string {
  if (typeof model === 'string') {
    return prettifyModelId(model);
  }
  const provided = (model.name || '').trim();
  if (provided && provided.toLowerCase() !== model.id.toLowerCase()) {
    return provided;
  }
  return prettifyModelId(model.id);
}

export async function fetchLMStudioModels(baseUrl: string): Promise<void> {
  lmStudioStatus.set('checking');
  lmStudioError.set(null);
  try {
    // Use Tauri-side HTTP fetch path to avoid webview/CORS limitations.
    const raw = await aiFetchModels(baseUrl, 'lm-studio');
    const parsed = JSON.parse(raw);
    const models: OpenRouterModel[] = (parsed.data || []).map((m: any) => ({
      id: m.id,
      name: getModelDisplayName({ id: m.id, name: m.id }),
      context_length: m.context_length || inferContextLength(m.id || ''),
    }));
    lmStudioModels.set(models);
    lmStudioStatus.set('connected');
  } catch (e) {
    lmStudioModels.set([]);
    lmStudioStatus.set('disconnected');
    lmStudioError.set(e instanceof Error ? e.message : String(e));
  }
}

export async function ensureLMStudioModelLoaded(baseUrl: string, modelId: string): Promise<void> {
  const currentModel = get(lmStudioLoadedModel);
  const currentInstance = get(lmStudioActiveInstanceId);

  if (currentModel === modelId && currentInstance) {
    return;
  }

  if (currentInstance && currentModel && currentModel !== modelId) {
    try {
      await aiLMStudioUnloadModel(baseUrl, currentInstance);
    } catch {
      // Ignore unload failures and continue attempting load.
    }
  }

  const raw = await aiLMStudioLoadModel(baseUrl, modelId);
  const parsed = JSON.parse(raw || '{}');
  const instanceId = String(parsed.instance_id || modelId).trim();

  lmStudioLoadedModel.set(modelId);
  lmStudioActiveInstanceId.set(instanceId || modelId);
}

export function inferContextLength(modelId: string): number {
  return inferModelSettings(modelId).contextWindow;
}

/**
 * Fetch available models. When called without arguments, uses the current
 * provider setting. Pass `providerOverride` to force fetching from a
 * specific provider (e.g. 'openrouter' from the OpenRouter refresh button).
 */
export async function fetchModels(providerOverride?: 'openrouter' | 'anthropic' | 'openai' | 'lmstudio'): Promise<void> {
  const s = get(settings);
  const provider = providerOverride || s.aiProvider;

  if (provider === 'anthropic') {
    availableModels.set(
      ANTHROPIC_MODELS.map((m) => ({
        ...m,
        id: `anthropic/${m.id}`,
      })),
    );
    modelsError.set(null);
    modelsLastFetched.set(Date.now());
    return;
  }

  if (provider === 'openai') {
    availableModels.set(
      OPENAI_MODELS.map((m) => ({
        ...m,
        id: `openai/${m.id}`,
      })),
    );
    modelsError.set(null);
    modelsLastFetched.set(Date.now());
    return;
  }

  // For OpenRouter (explicit or fallback), always use the OpenRouter key and base URL
  const apiKey = provider === 'openrouter'
    ? (s.aiOpenRouterApiKey || '').trim()
    : getActiveAIKey(s);
  const baseUrl = provider === 'openrouter'
    ? (s.aiOpenRouterBaseUrl || 'https://openrouter.ai/api/v1').trim()
    : getActiveAIBaseUrl(s);

  if (!apiKey && provider !== 'lmstudio') {
    modelsError.set('No API key configured');
    return;
  }

  modelsLoading.set(true);
  modelsError.set(null);

  try {
    const raw = await aiFetchModels(baseUrl, apiKey);
    const parsed = JSON.parse(raw);
    const models: OpenRouterModel[] = (parsed.data || [])
      .map((m: any) => ({
        id: m.id,
        name: getModelDisplayName({ id: m.id, name: m.name || m.id }),
        created: m.created ?? undefined,
        context_length: m.context_length || inferContextLength(m.id || ''),
        pricing: m.pricing,
      }))
      .sort((a: OpenRouterModel, b: OpenRouterModel) => a.id.localeCompare(b.id));

    availableModels.set(models);
    modelsLastFetched.set(Date.now());

    // Prune stale enabled models that no longer exist on the provider
    pruneStaleModels(models);
  } catch (e) {
    modelsError.set(e instanceof Error ? e.message : String(e));
  } finally {
    modelsLoading.set(false);
  }
}

/**
 * Remove enabled models that no longer exist in the fetched model list.
 * Only prunes OpenRouter models (those with a prefix/ that aren't anthropic/ or openai/).
 * If the current default model was pruned, falls back to the first remaining enabled model.
 */
function pruneStaleModels(freshModels: OpenRouterModel[]): void {
  const s = get(settings);
  const freshIds = new Set(freshModels.map((m) => m.id));

  // Also include hardcoded Anthropic/OpenAI models as always-valid
  for (const m of ANTHROPIC_MODELS) freshIds.add(`anthropic/${m.id}`);
  for (const m of OPENAI_MODELS) freshIds.add(`openai/${m.id}`);

  // Also include LM Studio models as always-valid (they use org/model IDs too)
  const lmsIds = new Set(get(lmStudioModels).map((m) => m.id));

  const enabled = s.aiEnabledModels || [];
  const pruned = enabled.filter((id) => {
    // Models without a prefix are managed separately (LM Studio bare IDs)
    if (!id.includes('/')) return true;
    // Anthropic/OpenAI direct models are always valid (hardcoded lists)
    if (id.startsWith('anthropic/') || id.startsWith('openai/')) return true;
    // LM Studio models with org/model format are always valid
    if (lmsIds.has(id)) return true;
    // If LM Studio is the active provider, don't prune slash models
    // (LM Studio list may not be loaded yet)
    if (s.aiProvider === 'lmstudio') return true;
    // OpenRouter models must exist in the fresh list
    return freshIds.has(id);
  });

  if (pruned.length < enabled.length) {
    const removed = enabled.filter((id) => !pruned.includes(id));
    console.warn('[models] Pruned stale models:', removed);
    updateSetting('aiEnabledModels', pruned);

    // If the default model was pruned, switch to first available
    if (s.aiModel && !pruned.includes(s.aiModel) && !freshIds.has(s.aiModel)) {
      const fallback = pruned[0] || 'anthropic/claude-sonnet-4-6';
      console.warn(`[models] Default model ${s.aiModel} no longer available, switching to ${fallback}`);
      updateSetting('aiModel', fallback);
    }
  }
}

/**
 * Auto-refresh OpenRouter models on app startup.
 * Silently fetches the latest model list if an OpenRouter API key exists.
 */
export async function refreshModelsOnStartup(): Promise<void> {
  const s = get(settings);
  const orKey = (s.aiOpenRouterApiKey || '').trim();

  // Always refresh OpenRouter models if we have a key
  if (orKey) {
    try {
      await fetchModels('openrouter');
    } catch {
      // Silent failure on startup - don't block the app
    }
  }
}
