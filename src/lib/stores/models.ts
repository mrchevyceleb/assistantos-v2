import { writable, get } from 'svelte/store';
import { aiFetchModels, aiLMStudioLoadModel, aiLMStudioUnloadModel } from '$lib/utils/tauri';
import { settings, getActiveAIBaseUrl, getActiveAIKey } from './settings';
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

export async function fetchModels(): Promise<void> {
  const s = get(settings);
  if (s.aiProvider === 'anthropic') {
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

  if (s.aiProvider === 'openai') {
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

  const apiKey = getActiveAIKey(s);
  const baseUrl = getActiveAIBaseUrl(s);

  if (!apiKey && s.aiProvider !== 'lmstudio') {
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
  } catch (e) {
    modelsError.set(e instanceof Error ? e.message : String(e));
  } finally {
    modelsLoading.set(false);
  }
}
