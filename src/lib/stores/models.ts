import { writable, get } from 'svelte/store';
import { aiFetchModels } from '$lib/utils/tauri';
import { settings } from './settings';

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

export async function fetchModels(): Promise<void> {
  const s = get(settings);
  if (!s.aiApiKey) {
    modelsError.set('No API key configured');
    return;
  }

  modelsLoading.set(true);
  modelsError.set(null);

  try {
    const raw = await aiFetchModels(s.aiBaseUrl, s.aiApiKey);
    const parsed = JSON.parse(raw);
    const models: OpenRouterModel[] = (parsed.data || [])
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        created: m.created ?? undefined,
        context_length: m.context_length,
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
