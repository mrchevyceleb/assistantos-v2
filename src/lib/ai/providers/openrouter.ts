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

export async function streamCompletion(
  messages: ChatMessage[],
  settings: AIChatSettings,
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const requestId = `req-${Date.now()}-${++requestCounter}`;
  const processor = new StreamProcessor();

  // Build request body
  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
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
