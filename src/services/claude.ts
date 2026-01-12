import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';

export interface ChatChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'iteration_boundary';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolId?: string;
  result?: string;
  error?: string;
}

export interface ToolExecutor {
  (name: string, input: Record<string, unknown>): Promise<string>;
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
    systemPrompt: string
  ): AsyncGenerator<ChatChunk> {
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages as MessageParam[],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'text', text: delta.text };
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', error: errorMessage };
    }
  }

  async *chat(
    userMessage: string,
    tools: Tool[],
    systemPrompt: string,
    executeToolFn: ToolExecutor
  ): AsyncGenerator<ChatChunk> {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    let continueLoop = true;
    const maxIterations = 20; // Safety limit
    let iterations = 0;

    while (continueLoop && iterations < maxIterations) {
      iterations++;

      try {
        // Create streaming message
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: this.conversationHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        let currentText = '';
        const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Process stream events
        for await (const event of stream) {
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
            yield {
              type: 'tool_use',
              toolName: toolUse.name,
              toolInput: toolUse.input,
              toolId: toolUse.id,
            };

            try {
              const result = await executeToolFn(toolUse.name, toolUse.input);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result,
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
            yield { type: 'error', error: 'Response was cut off due to token limits. Try reducing the context or starting a new conversation.' };
          }
          continueLoop = false;
        }

      } catch (error) {
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
