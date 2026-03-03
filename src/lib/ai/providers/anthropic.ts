import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { aiChatStreamAnthropic } from '$lib/utils/tauri';
import type { AIChatSettings, ChatMessage, StreamChunk, ToolCall, ToolDefinition } from '../types';

interface StreamCallbacks {
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

let requestCounter = 0;

class AnthropicStreamProcessor {
  private accumulatedToolCalls: Map<number, ToolCall> = new Map();
  private _finishReason: string | null = null;

  processLine(data: string): StreamChunk | null {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    const eventType = parsed.type;
    if (!eventType) return null;

    if (eventType === 'message_stop') {
      return { type: 'done', finishReason: this._finishReason || 'stop' };
    }

    if (eventType === 'message_delta') {
      const stop = parsed.delta?.stop_reason;
      if (stop === 'tool_use') this._finishReason = 'tool_calls';
      if (stop === 'end_turn' || stop === 'stop_sequence') this._finishReason = 'stop';
      return null;
    }

    if (eventType === 'content_block_start') {
      const index = Number(parsed.index || 0);
      const block = parsed.content_block;

      if (block?.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.length > 0) {
        return { type: 'thinking', content: block.thinking };
      }

      if (block?.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        return { type: 'text', content: block.text };
      }

      if (block?.type === 'tool_use') {
        const toolCall: ToolCall = {
          id: block.id || `tool-${Date.now()}-${index}`,
          type: 'function',
          function: {
            name: block.name || '',
            arguments: block.input ? JSON.stringify(block.input) : '',
          },
        };
        this.accumulatedToolCalls.set(index, toolCall);
      }
      return null;
    }

    if (eventType === 'content_block_delta') {
      const index = Number(parsed.index || 0);
      const delta = parsed.delta;

      if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        return { type: 'thinking', content: delta.thinking };
      }

      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'text', content: delta.text };
      }

      if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const existing = this.accumulatedToolCalls.get(index);
        if (existing) {
          existing.function.arguments += delta.partial_json;
        }
      }
    }

    return null;
  }

  getAccumulatedToolCalls(): ToolCall[] {
    const calls = Array.from(this.accumulatedToolCalls.values());
    this.accumulatedToolCalls.clear();
    return calls;
  }

  get finishReason(): string | null {
    return this._finishReason;
  }

  reset() {
    this.accumulatedToolCalls.clear();
    this._finishReason = null;
  }
}

function normalizeAnthropicModel(model: string): string {
  return model.startsWith('anthropic/') ? model.slice('anthropic/'.length) : model;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toAnthropicPayload(
  messages: ChatMessage[],
  settings: AIChatSettings,
  tools: ToolDefinition[] | undefined,
): Record<string, unknown> {
  const systemParts: string[] = [];
  const anthropicMessages: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) {
        systemParts.push(message.content);
      }
      continue;
    }

    if (message.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id,
            content: message.content || '',
          },
        ],
      });
      continue;
    }

    if (message.role === 'assistant') {
      const blocks: Array<Record<string, unknown>> = [];

      if (message.content) {
        blocks.push({ type: 'text', text: message.content });
      }

      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: safeJsonParse(call.function.arguments || '{}'),
          });
        }
      }

      anthropicMessages.push({
        role: 'assistant',
        content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }],
      });
      continue;
    }

    const userBlocks: Array<Record<string, unknown>> = [];
    if (message.images?.length) {
      for (const img of message.images) {
        userBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.base64,
          },
        });
      }
    }
    userBlocks.push({ type: 'text', text: message.content || '' });
    anthropicMessages.push({
      role: 'user',
      content: userBlocks,
    });
  }

  // Cap max_tokens so it never exceeds the model's context window.
  const contextLimit = settings.contextWindow || 128000;
  const safeMaxTokens = Math.min(settings.maxTokens, Math.floor(contextLimit * 0.75));

  const payload: Record<string, unknown> = {
    model: normalizeAnthropicModel(settings.model),
    stream: true,
    max_tokens: safeMaxTokens,
    temperature: settings.temperature,
    messages: anthropicMessages,
  };

  const system = systemParts.join('\n\n').trim();
  if (system) {
    payload.system = system;
  }

  if (tools && tools.length > 0 && settings.enableToolUse) {
    payload.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  return payload;
}

export async function streamAnthropicCompletion(
  messages: ChatMessage[],
  settings: AIChatSettings,
  tools: ToolDefinition[] | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const requestId = `anth-${Date.now()}-${++requestCounter}`;
  const processor = new AnthropicStreamProcessor();
  const bodyJson = JSON.stringify(toAnthropicPayload(messages, settings, tools));

  const cleanupFns: UnlistenFn[] = [];

  try {
    cleanupFns.push(
      await listen<{ request_id: string; data: string }>('ai-stream-chunk', (event) => {
        if (event.payload.request_id !== requestId) return;
        const chunk = processor.processLine(event.payload.data);
        if (chunk) {
          callbacks.onChunk(chunk);
        }
      }),
    );

    const doneUnlisten = listen<{ request_id: string }>('ai-stream-done', (event) => {
      if (event.payload.request_id !== requestId) return;

      const remaining = processor.getAccumulatedToolCalls();
      const finishReason = processor.finishReason;
      for (let i = 0; i < remaining.length; i++) {
        callbacks.onChunk({
          type: 'tool_call',
          toolCall: remaining[i],
          finishReason: i === 0 ? finishReason || 'tool_calls' : undefined,
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

    cleanupFns.push(await doneUnlisten);
    cleanupFns.push(await errorUnlisten);

    donePromise.catch(() => {});

    await aiChatStreamAnthropic(requestId, settings.baseUrl, settings.apiKey, bodyJson);
    await donePromise;
  } finally {
    for (const fn of cleanupFns) fn();
    processor.reset();
  }
}
