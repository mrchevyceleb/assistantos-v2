import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { aiChatStream } from '$lib/utils/tauri';
import { StreamProcessor } from '../chat/stream-processor';
import type { ChatMessage, StreamChunk, ToolDefinition, AIChatSettings } from '../types';

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

export async function streamOpenAICompatibleCompletion(
  messages: ChatMessage[],
  settings: AIChatSettings,
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const requestId = `req-${Date.now()}-${++requestCounter}`;
  const processor = new StreamProcessor();

  // Build request body - convert messages with images to multimodal format
  const apiMessages = messages.map(m => {
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

  // Cap max_tokens so it never exceeds the model's context window.
  // Reserve at least 25% of context for input + tool definitions.
  const contextLimit = settings.contextWindow || 128000;
  const safeMaxTokens = Math.min(settings.maxTokens, Math.floor(contextLimit * 0.75));

  const body: Record<string, unknown> = {
    model: settings.model,
    messages: apiMessages,
    temperature: settings.temperature,
    max_tokens: safeMaxTokens,
    stream: true,
  };

  if (tools && tools.length > 0 && settings.enableToolUse) {
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
