import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock, ToolResultBlockParam, ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';

export interface ChatChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'iteration_boundary' | 'aborted' | 'context_overflow';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolId?: string;
  result?: string;
  error?: string;
  /** For context_overflow type - indicates if recovery is possible */
  recoveryPossible?: boolean;
}

/**
 * Token usage breakdown for debugging context limits
 */
export interface TokenUsageBreakdown {
  systemPrompt: number;
  tools: number;
  toolCount: number;
  messages: number;
  total: number;
  limit: number;
  percentage: number;
}

/**
 * Estimate tokens from text (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Tool result truncation settings
 * Claude Code uses similar limits to keep context manageable
 */
const TOOL_RESULT_LIMITS = {
  /** Maximum characters for tool results stored in history */
  MAX_RESULT_CHARS: 8000,
  /** Characters to keep from start when truncating */
  HEAD_CHARS: 5000,
  /** Characters to keep from end when truncating */
  TAIL_CHARS: 2000,
  /** Tools that commonly produce large output */
  LARGE_OUTPUT_TOOLS: ['bash', 'read_file', 'list_directory', 'perplexity_search', 'brave_web_search']
};

/**
 * Truncate a tool result to prevent context bloat
 * Uses head/tail truncation similar to Claude Code
 */
function truncateToolResult(result: string, toolName: string): string {
  if (result.length <= TOOL_RESULT_LIMITS.MAX_RESULT_CHARS) {
    return result;
  }

  const head = result.slice(0, TOOL_RESULT_LIMITS.HEAD_CHARS);
  const tail = result.slice(-TOOL_RESULT_LIMITS.TAIL_CHARS);
  const omittedChars = result.length - TOOL_RESULT_LIMITS.HEAD_CHARS - TOOL_RESULT_LIMITS.TAIL_CHARS;
  const omittedTokens = Math.ceil(omittedChars / 4);

  return `${head}\n\n[... ${omittedChars.toLocaleString()} characters (~${omittedTokens.toLocaleString()} tokens) truncated from ${toolName} output ...]\n\n${tail}`;
}

/**
 * Get per-tool token usage for debugging
 * Helps identify which MCP tools are consuming the most context
 */
export function getToolTokenBreakdown(
  tools: Array<{ name: string; description?: string; input_schema?: object }>
): Array<{ name: string; tokens: number }> {
  return tools
    .map(tool => {
      let tokens = estimateTokens(tool.name);
      tokens += estimateTokens(tool.description || '');
      if (tool.input_schema) {
        tokens += estimateTokens(JSON.stringify(tool.input_schema));
      }
      return { name: tool.name, tokens };
    })
    .sort((a, b) => b.tokens - a.tokens); // Sort by tokens descending
}

/**
 * Log the top N tools by token usage
 */
export function logTopToolsByTokens(
  tools: Array<{ name: string; description?: string; input_schema?: object }>,
  topN: number = 10
): void {
  const breakdown = getToolTokenBreakdown(tools);
  const topTools = breakdown.slice(0, topN);
  const totalTokens = breakdown.reduce((sum, t) => sum + t.tokens, 0);

  console.log(`[Claude Service] Tool definition tokens (${tools.length} tools, ${totalTokens.toLocaleString()} total tokens):`);
  console.log(`  Top ${topN} by size:`);
  for (const tool of topTools) {
    console.log(`    - ${tool.name}: ${tool.tokens.toLocaleString()} tokens`);
  }

  // Warn if any single tool is using a lot of tokens
  const largeTools = breakdown.filter(t => t.tokens > 500);
  if (largeTools.length > 0) {
    console.warn(`[Claude Service] ${largeTools.length} tools using >500 tokens each (consider schema optimization)`);
  }
}

/**
 * Calculate token usage breakdown for debugging
 */
export function calculateTokenBreakdown(
  systemPrompt: string,
  tools: Array<{ name: string; description?: string; input_schema?: object }>,
  messages: MessageParam[],
  maxTokens: number = 200000
): TokenUsageBreakdown {
  // System prompt tokens
  const systemPromptTokens = estimateTokens(systemPrompt);

  // Tool definition tokens (includes schema which can be large)
  let toolTokens = 0;
  for (const tool of tools) {
    toolTokens += estimateTokens(tool.name);
    toolTokens += estimateTokens(tool.description || '');
    if (tool.input_schema) {
      toolTokens += estimateTokens(JSON.stringify(tool.input_schema));
    }
  }

  // Message tokens
  let messageTokens = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      messageTokens += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block && typeof block.text === 'string') {
          messageTokens += estimateTokens(block.text);
        } else if ('content' in block && typeof block.content === 'string') {
          // Tool result block
          messageTokens += estimateTokens(block.content);
        } else if ('type' in block && block.type === 'image') {
          // Images use ~1000 tokens per image (rough estimate)
          messageTokens += 1000;
        }
      }
    }
    // Add overhead for message structure
    messageTokens += 10;
  }

  const total = systemPromptTokens + toolTokens + messageTokens;
  const percentage = (total / maxTokens) * 100;

  return {
    systemPrompt: systemPromptTokens,
    tools: toolTokens,
    toolCount: tools.length,
    messages: messageTokens,
    total,
    limit: maxTokens,
    percentage
  };
}

export interface ToolExecutor {
  (name: string, input: Record<string, unknown>): Promise<string>;
}

/**
 * Check if an error is a context overflow error from Claude API
 * These errors occur when input_length + max_tokens > context_limit
 */
export function isContextOverflowError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('context limit') ||
    message.includes('context window') ||
    message.includes('exceed') && (message.includes('token') || message.includes('limit')) ||
    message.includes('input length') && message.includes('max_tokens') ||
    message.includes('too many tokens') ||
    message.includes('request too large')
  );
}

/**
 * Parse context overflow error to extract useful information
 */
export function parseContextOverflowError(error: Error): {
  inputTokens?: number;
  maxTokens?: number;
  contextLimit?: number;
} {
  const result: { inputTokens?: number; maxTokens?: number; contextLimit?: number } = {};

  // Try to extract numbers from error message like:
  // "input length and max_tokens exceed context limit: 190015 + 15000 > 200000"
  const match = error.message.match(/(\d+)\s*\+\s*(\d+)\s*>\s*(\d+)/);
  if (match) {
    result.inputTokens = parseInt(match[1], 10);
    result.maxTokens = parseInt(match[2], 10);
    result.contextLimit = parseInt(match[3], 10);
  }

  return result;
}

/**
 * Image content for sending to Claude API
 */
export interface ImageContent {
  type: 'base64';
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string; // base64 encoded image data (without data URL prefix)
}

/**
 * Build message content array with text and images for Claude API
 */
export function buildMessageContent(
  text: string,
  images?: ImageContent[]
): (ImageBlockParam | TextBlockParam)[] {
  const content: (ImageBlockParam | TextBlockParam)[] = [];

  // Add images first (Claude prefers images before text)
  if (images && images.length > 0) {
    for (const image of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType,
          data: image.data,
        },
      });
    }
  }

  // Add text content
  if (text.trim()) {
    content.push({
      type: 'text',
      text: text,
    });
  }

  return content;
}

export class ClaudeService {
  private client: Anthropic;
  private conversationHistory: MessageParam[] = [];
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514', maxTokens: number = 8192) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  setModel(model: string) {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  setMaxTokens(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  getMaxTokens(): number {
    return this.maxTokens;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Simple streaming message without tools (used for compaction, summaries)
   */
  async *streamMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<ChatChunk> {
    try {
      // Check if already aborted
      if (abortSignal?.aborted) {
        yield { type: 'aborted' };
        return;
      }

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages as MessageParam[],
      });

      // Set up abort handler
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          stream.abort();
        }, { once: true });
      }

      for await (const event of stream) {
        // Check for abort during streaming
        if (abortSignal?.aborted) {
          yield { type: 'aborted' };
          return;
        }

        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'text', text: delta.text };
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      // Handle abort errors gracefully
      if (abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'aborted' };
        return;
      }

      // Handle context overflow errors with specific error type
      if (isContextOverflowError(error)) {
        const parsed = parseContextOverflowError(error as Error);
        const detailMessage = parsed.inputTokens
          ? `Context limit exceeded (${parsed.inputTokens.toLocaleString()} input + ${parsed.maxTokens?.toLocaleString() || '?'} max_tokens > ${parsed.contextLimit?.toLocaleString() || '200K'} limit)`
          : 'Context limit exceeded';
        yield {
          type: 'context_overflow',
          error: `${detailMessage}. You can increase the max tokens setting in Settings, use /compact to summarize the conversation, or start a new chat.`,
          recoveryPossible: true
        };
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', error: errorMessage };
    }
  }

  async *chat(
    userMessage: string,
    tools: Tool[],
    systemPrompt: string,
    executeToolFn: ToolExecutor,
    abortSignal?: AbortSignal,
    images?: ImageContent[]
  ): AsyncGenerator<ChatChunk> {
    // Check if already aborted
    if (abortSignal?.aborted) {
      yield { type: 'aborted' };
      return;
    }

    // Build message content (text + optional images)
    const messageContent = images && images.length > 0
      ? buildMessageContent(userMessage, images)
      : userMessage;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: messageContent,
    });

    let continueLoop = true;
    const maxIterations = 20; // Safety limit
    let iterations = 0;

    while (continueLoop && iterations < maxIterations) {
      // Check for abort at start of each iteration
      if (abortSignal?.aborted) {
        yield { type: 'aborted' };
        return;
      }

      iterations++;

      // Debug: Log token breakdown on first iteration
      if (iterations === 1) {
        const breakdown = calculateTokenBreakdown(systemPrompt, tools, this.conversationHistory);
        console.log('[Claude Service] Token usage breakdown:', {
          systemPrompt: `${breakdown.systemPrompt.toLocaleString()} tokens`,
          tools: `${breakdown.tools.toLocaleString()} tokens (${breakdown.toolCount} tools)`,
          messages: `${breakdown.messages.toLocaleString()} tokens`,
          total: `${breakdown.total.toLocaleString()} / ${breakdown.limit.toLocaleString()} (${breakdown.percentage.toFixed(1)}%)`
        });

        // Log detailed tool breakdown if tools are using significant tokens
        if (breakdown.tools > 5000 && tools.length > 0) {
          logTopToolsByTokens(tools, 10);
        }

        if (breakdown.percentage > 50) {
          console.warn('[Claude Service] WARNING: Context usage above 50%! Consider using /compact or starting fresh.');
        }
      }

      try {
        // Create streaming message
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: this.conversationHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Set up abort handler for this stream
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            stream.abort();
          }, { once: true });
        }

        let currentText = '';
        const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Process stream events
        for await (const event of stream) {
          // Check for abort during streaming
          if (abortSignal?.aborted) {
            yield { type: 'aborted' };
            return;
          }

          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta) {
              currentText += delta.text;
              yield { type: 'text', text: delta.text };
            } else if ('partial_json' in delta) {
              // Tool input being streamed - we'll get the full input at the end
            }
          } else if (event.type === 'content_block_start') {
            const block = event.content_block;
            if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                toolName: block.name,
                toolId: block.id
              };
            }
          }
        }

        // Get the final message to extract tool use blocks
        const finalMessage = await stream.finalMessage();

        // Collect all content blocks
        const assistantContent: ContentBlock[] = [];

        for (const block of finalMessage.content) {
          if (block.type === 'text') {
            assistantContent.push(block);
          } else if (block.type === 'tool_use') {
            assistantContent.push(block);
            toolUseBlocks.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }

        // Add assistant response to history
        this.conversationHistory.push({
          role: 'assistant',
          content: assistantContent,
        });

        // If there are tool uses, execute them and continue the loop
        if (toolUseBlocks.length > 0) {
          const toolResults: ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            // Check for abort before executing each tool
            if (abortSignal?.aborted) {
              yield { type: 'aborted' };
              return;
            }

            yield {
              type: 'tool_use',
              toolName: toolUse.name,
              toolInput: toolUse.input,
              toolId: toolUse.id,
            };

            try {
              const result = await executeToolFn(toolUse.name, toolUse.input);
              // Truncate large tool results to prevent context bloat
              // This is the #1 cause of rapid context exhaustion
              const truncatedResult = truncateToolResult(result, toolUse.name);
              if (result.length !== truncatedResult.length) {
                console.log(`[Claude Service] Truncated ${toolUse.name} result: ${result.length} -> ${truncatedResult.length} chars`);
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: truncatedResult,
              });
              yield {
                type: 'tool_result',
                toolId: toolUse.id,
                result: result.substring(0, 500) + (result.length > 500 ? '...' : ''),
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Error: ${errorMessage}`,
                is_error: true,
              });
              yield {
                type: 'tool_result',
                toolId: toolUse.id,
                result: `Error: ${errorMessage}`,
              };
            }
          }

          // Add tool results to history
          this.conversationHistory.push({
            role: 'user',
            content: toolResults,
          });

          // Signal iteration boundary - UI can add line breaks between text segments
          yield { type: 'iteration_boundary' };

          // Continue loop to get Claude's response after tool execution
          continueLoop = true;
        } else if (currentText.trim() === '') {
          // No tool use AND no text content - this is an empty response
          // This can happen when the model fails to generate output after tool use
          yield { type: 'error', error: 'Claude returned an empty response. This may indicate the request was too complex or hit a limit. Try simplifying your request or starting a new conversation.' };
          continueLoop = false;
        } else {
          // No tool use, we're done
          continueLoop = false;
        }

        // Check stop reason
        if (finalMessage.stop_reason === 'end_turn') {
          continueLoop = false;
        } else if (finalMessage.stop_reason === 'max_tokens') {
          // Model hit token limit - warn user if there's no text
          if (currentText.trim() === '' && toolUseBlocks.length === 0) {
            yield { type: 'error', error: 'Response was cut off due to max tokens limit. You can increase the max tokens setting in Settings, reduce the context, or start a new conversation.' };
          }
          continueLoop = false;
        }

      } catch (error) {
        // Handle abort errors gracefully
        if (abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          yield { type: 'aborted' };
          return;
        }

        // Handle context overflow errors with specific error type and recovery suggestion
        if (isContextOverflowError(error)) {
          const parsed = parseContextOverflowError(error as Error);
          const detailMessage = parsed.inputTokens
            ? `Context limit exceeded (${parsed.inputTokens.toLocaleString()} input + ${parsed.maxTokens?.toLocaleString() || '?'} max_tokens > ${parsed.contextLimit?.toLocaleString() || '200K'} limit)`
            : 'Context limit exceeded';
          console.warn('[Claude Service] Context overflow detected:', error);
          yield {
            type: 'context_overflow',
            error: `${detailMessage}. You can increase the max tokens setting in Settings, use /compact to summarize the conversation, or start a new chat.`,
            recoveryPossible: this.conversationHistory.length > 10 // Can compact if there's enough history
          };
          continueLoop = false;
          break;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Claude Service] Error in chat loop:', error);
        yield { type: 'error', error: errorMessage };
        continueLoop = false;
      }
    }

    if (iterations >= maxIterations) {
      yield { type: 'error', error: `Maximum iterations (${maxIterations}) reached. The task may be too complex for a single request.` };
    }

    yield { type: 'done' };
  }
}
