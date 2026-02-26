import type { StreamChunk, ToolCall } from '../types';

export class StreamProcessor {
  private accumulatedToolCalls: Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }> = new Map();
  private _finishReason: string | null = null;

  processLine(data: string): StreamChunk | null {
    // Skip [DONE] signal
    if (data === '[DONE]') {
      return { type: 'done', finishReason: this._finishReason || 'stop' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null; // Skip unparseable lines
    }

    const choice = parsed.choices?.[0];
    if (!choice) return null;

    const delta = choice.delta;
    const finishReason = choice.finish_reason;

    // Handle finish - don't emit tool calls here, let the provider flush them
    // via getAccumulatedToolCalls() in the onDone handler
    if (finishReason === 'tool_calls') {
      this._finishReason = 'tool_calls';
      return { type: 'done', finishReason: 'tool_calls' };
    }

    if (finishReason === 'stop') {
      this._finishReason = 'stop';
      return { type: 'done', finishReason: 'stop' };
    }

    // Handle text content
    if (delta?.content) {
      return { type: 'text', content: delta.content };
    }

    // Handle tool call deltas (streamed incrementally)
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const existing = this.accumulatedToolCalls.get(idx);

        if (tc.id) {
          // New tool call starting
          this.accumulatedToolCalls.set(idx, {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            },
          });
        } else if (existing) {
          // Continuation of existing tool call
          if (tc.function?.name) {
            existing.function.name += tc.function.name;
          }
          if (tc.function?.arguments) {
            existing.function.arguments += tc.function.arguments;
          }
        }
      }
    }

    return null;
  }

  getAccumulatedToolCalls(): ToolCall[] {
    const calls = Array.from(this.accumulatedToolCalls.values()) as ToolCall[];
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
