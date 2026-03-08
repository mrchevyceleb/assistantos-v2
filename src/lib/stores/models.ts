import { writable, get } from 'svelte/store';
import { aiFetchModels } from '$lib/utils/tauri';
import { settings, getActiveAIBaseUrl, getActiveAIKey } from './settings';

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
  { id: 'gpt-4.1', name: 'GPT-4.1', context_length: 128000 },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', context_length: 128000 },
  { id: 'o3', name: 'o3', context_length: 200000 },
  { id: 'o4-mini', name: 'o4 Mini', context_length: 200000 },
];

export const lmStudioStatus = writable<'connected' | 'disconnected' | 'checking'>('disconnected');
export const lmStudioModels = writable<OpenRouterModel[]>([]);

export async function fetchLMStudioModels(baseUrl: string): Promise<void> {
  lmStudioStatus.set('checking');
  try {
    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const parsed = await resp.json();
    const models: OpenRouterModel[] = (parsed.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      context_length: m.context_length || inferContextLength(m.id || ''),
    }));
    lmStudioModels.set(models);
    lmStudioStatus.set('connected');
  } catch {
    lmStudioModels.set([]);
    lmStudioStatus.set('disconnected');
  }
}

export function inferContextLength(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id.includes('gemini')) return 1000000;
  if (id.includes('claude')) return 200000;
  if (id.includes('gpt-5')) return 400000;
  if (id.includes('gpt-4.1')) return 128000;
  if (id.includes('gpt-4')) return 128000;
  if (id.includes('codex')) return 200000;
  return 128000;
}

export async function fetchModels(): Promise<void> {
  const s = get(settings);
  if (s.aiProvider === 'anthropic') {
    availableModels.set(ANTHROPIC_MODELS);
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
        name: m.name || m.id,
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
