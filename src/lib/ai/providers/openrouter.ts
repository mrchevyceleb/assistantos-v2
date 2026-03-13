import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { aiChatStream } from '$lib/utils/tauri';
import { StreamProcessor } from '../chat/stream-processor';
import type { ChatMessage, StreamChunk, ToolDefinition, AIChatSettings } from '../types';
import { inferModelSettings } from '../model-registry';
import { ensureLMStudioModelLoaded } from '$lib/stores/models';

interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

let requestCounter = 0;

function extractThinkingFromOpenAIChunk(rawData: string): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }

  const delta = parsed?.choices?.[0]?.delta;
  if (!delta) return null;

  if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
    return delta.reasoning;
  }

  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
    return delta.reasoning_content;
  }

  const details = delta.reasoning_details;
  if (Array.isArray(details)) {
    const joined = details
      .map((d: any) => {
        if (typeof d === 'string') return d;
        if (typeof d?.text === 'string') return d.text;
        if (typeof d?.reasoning === 'string') return d.reasoning;
        return '';
      })
      .filter(Boolean)
      .join('');

    if (joined.length > 0) return joined;
  }

  return null;
}

/**
 * Strip orphaned tool messages and incomplete tool_call pairs.
 * Ensures every role:'tool' message follows an assistant message with matching tool_calls.
 */
function sanitizeToolPairs(messages: ChatMessage[]): ChatMessage[] {
  // Find all complete tool_call/result pairs
  const completeIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !msg.tool_calls?.length) continue;

    const expected = new Set(msg.tool_calls.map((tc) => tc.id));

    // Look at subsequent tool messages
    let j = i + 1;
    while (j < messages.length && messages[j].role === 'tool') {
      if (messages[j].tool_call_id && expected.has(messages[j].tool_call_id!)) {
        completeIds.add(messages[j].tool_call_id!);
      }
      j++;
    }
  }

  // Build clean array: strip orphaned tool messages and incomplete tool_calls
  const result: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'tool') {
      // Only keep tool results that have a complete pair
      if (msg.tool_call_id && completeIds.has(msg.tool_call_id)) {
        result.push(msg);
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const keptCalls = msg.tool_calls.filter((tc) => completeIds.has(tc.id));
      if (keptCalls.length === 0 && msg.content) {
        // Keep text content, strip tool_calls
        result.push({ ...msg, tool_calls: undefined });
      } else if (keptCalls.length > 0) {
        result.push({ ...msg, tool_calls: keptCalls });
      } else if (msg.content) {
        result.push({ ...msg, tool_calls: undefined });
      }
      // If no content and no kept calls, skip entirely
      continue;
    }

    result.push(msg);
  }

  return result;
}

export async function streamOpenAICompatibleCompletion(
  messages: ChatMessage[],
  settings: AIChatSettings,
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const requestId = `req-${Date.now()}-${++requestCounter}`;
  const processor = new StreamProcessor();

  if (settings.provider === 'lmstudio') {
    await ensureLMStudioModelLoaded(settings.baseUrl, settings.model);
  }

  const normalizedModel = (() => {
    if (settings.provider === 'openai' && settings.model.startsWith('openai/')) {
      return settings.model.slice('openai/'.length);
    }
    if (settings.provider === 'lmstudio') {
      if (settings.model.startsWith('openai/')) return settings.model.slice('openai/'.length);
      if (settings.model.startsWith('anthropic/')) return settings.model.slice('anthropic/'.length);
    }
    return settings.model;
  })();

  // Defensive sanitization: strip orphaned tool messages that don't match
  // a preceding assistant message with tool_calls. This prevents OpenAI
  // "messages with role 'tool' must be a response to a preceding message with 'tool_calls'" errors.
  const sanitized = sanitizeToolPairs(messages);

  // Build request body - convert messages with images to multimodal format
  const apiMessages = sanitized.map(m => {
    if (m.images?.length && m.role === 'user') {
      const content: Array<Record<string, unknown>> = [];
      for (const img of m.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
        });
      }
      if (m.content) {
        content.push({ type: 'text', text: m.content });
      }
      return { role: m.role, content };
    }
    // Strip images field from non-image messages
    const { images, ...rest } = m as unknown as Record<string, unknown>;
    return rest;
  });

  // Cap max_tokens: use model registry's maxOutputTokens if known, else 75% of context.
  const contextLimit = settings.contextWindow || 128000;
  const { maxOutputTokens: registryMax } = inferModelSettings(settings.model);
  const safeMaxTokens = Math.min(settings.maxTokens, registryMax, Math.floor(contextLimit * 0.75));

  const body: Record<string, unknown> = {
    model: normalizedModel,
    messages: apiMessages,
    temperature: settings.temperature,
    ...(settings.provider === 'openai'
      ? { max_completion_tokens: safeMaxTokens }
      : { max_tokens: safeMaxTokens }),
    stream: true,
  };

  // Request usage stats in streaming response (LM Studio may not support this)
  if (settings.provider !== 'lmstudio') {
    body.stream_options = { include_usage: true };
  }

  // Only send tools if the model/provider actually supports them
  const { supportsTools: modelSupportsTools } = inferModelSettings(settings.model);
  if (tools && tools.length > 0 && settings.enableToolUse && modelSupportsTools) {
    body.tools = tools;
  }

  const bodyJson = JSON.stringify(body);

  // Set up event listeners before starting the stream
  const cleanupFns: UnlistenFn[] = [];

  try {
    // Listen for stream chunks
    cleanupFns.push(await listen<{ request_id: string; data: string }>(
      'ai-stream-chunk',
      (event) => {
        if (event.payload.request_id !== requestId) return;

        const thinking = extractThinkingFromOpenAIChunk(event.payload.data);
        if (thinking) {
          callbacks.onChunk({ type: 'thinking', content: thinking });
        }

        const chunk = processor.processLine(event.payload.data);
        if (chunk) {
          callbacks.onChunk(chunk);
        }
      }
    ));

    // Listen for stream completion and errors
    // Register both listeners before starting the stream to avoid race conditions
    const doneUnlisten = listen<{ request_id: string }>('ai-stream-done', (event) => {
      if (event.payload.request_id !== requestId) return;

      // Flush any remaining accumulated tool calls
      const remaining = processor.getAccumulatedToolCalls();
      const finishReason = processor.finishReason;
      for (let i = 0; i < remaining.length; i++) {
        callbacks.onChunk({
          type: 'tool_call',
          toolCall: remaining[i],
          finishReason: i === 0 ? finishReason : undefined,
        });
      }

      // Emit real token counts if available
      if (processor.inputTokens || processor.outputTokens) {
        callbacks.onChunk({
          type: 'done',
          finishReason: finishReason || 'stop',
          inputTokens: processor.inputTokens || undefined,
          outputTokens: processor.outputTokens || undefined,
        });
      }

      callbacks.onDone();
      doneResolve();
    });

    const errorUnlisten = listen<{ request_id: string; error: string }>('ai-stream-error', (event) => {
      if (event.payload.request_id !== requestId) return;
      callbacks.onError(event.payload.error);
      doneReject(new Error(event.payload.error));
    });

    let doneResolve!: () => void;
    let doneReject!: (err: Error) => void;
    const donePromise = new Promise<void>((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    // Await listener registrations and add to cleanup
    cleanupFns.push(await doneUnlisten);
    cleanupFns.push(await errorUnlisten);

    // Start the stream via Rust backend
    // If aiChatStream rejects (Rust returned Err), the event listeners may also fire.
    // Catch donePromise rejection to avoid unhandled promise rejection.
    donePromise.catch(() => {}); // handled below via aiChatStream rejection

    await aiChatStream(requestId, settings.baseUrl, settings.apiKey, bodyJson);

    // Wait for completion
    await donePromise;
  } finally {
    // Clean up all listeners
    for (const fn of cleanupFns) fn();
    processor.reset();
  }
}

export const streamCompletion = streamOpenAICompatibleCompletion;
