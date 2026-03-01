import { get } from 'svelte/store';
import { workspacePath } from '$lib/stores/workspace';
import { readFileText } from '$lib/utils/tauri';
import { streamCompletion } from '../providers/openrouter';
import { executeTool } from '../tools/tool-executor';
import { getAllToolDefinitions, WRITE_TOOLS } from '../tools/tool-definitions';
import { SYSTEM_PROMPT } from '../constants';
import { ChatSession } from './session';
import type { ChatMessage, ToolCall, ToolResult, StreamChunk, AIChatSettings, ChatEngineCallbacks } from '../types';

/** File names to look for as workspace instructions (checked in order). */
const INSTRUCTION_FILES = ['AGENTS.MD', 'AGENTS.md', 'agents.md', 'CLAUDE.md', 'CLAUDE.MD', 'claude.md'];

export class ChatEngine {
  private session: ChatSession;
  private settings: AIChatSettings;
  private callbacks: ChatEngineCallbacks;
  private abortController: AbortController | null = null;
  private isRunning = false;
  private workspaceInstructions: string | null = null;
  private instructionsWorkspacePath: string | null = null;

  constructor(session: ChatSession, settings: AIChatSettings, callbacks: ChatEngineCallbacks) {
    this.session = session;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  get running(): boolean {
    return this.isRunning;
  }

  abort(): void {
    this.abortController?.abort();
    this.isRunning = false;
  }

  updateSettings(settings: AIChatSettings): void {
    this.settings = settings;
  }

  getSession(): ChatSession {
    return this.session;
  }

  /** Try to load AGENTS.MD / CLAUDE.md from the workspace root. */
  private async loadWorkspaceInstructions(): Promise<void> {
    const wsPath = get(workspacePath);
    this.workspaceInstructions = null;
    this.instructionsWorkspacePath = wsPath;
    if (!wsPath) return;

    const sep = wsPath.includes('\\') ? '\\' : '/';

    for (const name of INSTRUCTION_FILES) {
      try {
        const content = await readFileText(`${wsPath}${sep}${name}`);
        if (content && content.trim()) {
          this.workspaceInstructions = content.trim();
          this.instructionsWorkspacePath = wsPath;
          return;
        }
      } catch {
        // File doesn't exist, try next
      }
    }
    this.instructionsWorkspacePath = wsPath;
  }

  async sendMessage(userContent: string, options?: { mentions?: string[]; steer?: string }): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      const wsPath = get(workspacePath);
      if (
        this.settings.readInstructionsEachMessage !== false ||
        this.instructionsWorkspacePath !== wsPath
      ) {
        await this.loadWorkspaceInstructions();
      }

      // Add user message
      let enrichedUserContent = userContent;
      if (options?.mentions && options.mentions.length > 0) {
        const mentionLines = options.mentions.map((m) => `- ${m}`).join('\n');
        enrichedUserContent = `Tagged paths:\n${mentionLines}\n\nUser request:\n${userContent}`;
      }
      if (options?.steer) {
        enrichedUserContent = `${enrichedUserContent}\n\nSteering:\n${options.steer}`;
      }

      this.session.addMessage({ role: 'user', content: enrichedUserContent });

      // Run agentic loop
      let iterations = 0;
      const maxIterations = this.settings.maxToolIterations;

      while (iterations < maxIterations) {
        if (this.abortController.signal.aborted) break;
        iterations++;

        // Build messages array
        const messages = this.buildMessages();

        // Stream completion
        const tools = this.settings.enableToolUse ? getAllToolDefinitions() : undefined;
        let fullContent = '';
        let toolCalls: ToolCall[] = [];
        let finishReason = 'stop';

        await new Promise<void>((resolve, reject) => {
          streamCompletion(
            messages,
            this.settings,
            tools,
            {
              onChunk: (chunk: StreamChunk) => {
                if (this.abortController?.signal.aborted) return;

                switch (chunk.type) {
                  case 'text':
                    fullContent += chunk.content || '';
                    this.callbacks.onChunk(chunk.content || '');
                    break;
                  case 'tool_call':
                    if (chunk.toolCall) {
                      toolCalls.push(chunk.toolCall);
                    }
                    if (chunk.finishReason) {
                      finishReason = chunk.finishReason;
                    }
                    break;
                  case 'done':
                    if (chunk.finishReason) {
                      finishReason = chunk.finishReason;
                    }
                    break;
                  case 'error':
                    reject(new Error(chunk.content || 'Stream error'));
                    break;
                }
              },
              onDone: () => resolve(),
              onError: (error: string) => reject(new Error(error)),
            }
          ).catch(reject);
        });

        if (this.abortController.signal.aborted) break;

        // Handle response
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          // Add assistant message with tool calls
          this.session.addMessage({
            role: 'assistant',
            content: fullContent || null,
            tool_calls: toolCalls,
          });

          this.callbacks.onToolCall(toolCalls);

          // Execute each tool call
          const results: ToolResult[] = [];
          for (const tc of toolCalls) {
            if (this.abortController.signal.aborted) break;

            // Check if confirmation needed
            if (this.settings.confirmWrites && (WRITE_TOOLS.has(tc.function.name) || tc.function.name.startsWith('mcp__'))) {
              const confirmed = await this.callbacks.onToolConfirmation(tc);
              if (!confirmed) {
                results.push({
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  content: 'User denied this operation.',
                  isError: true,
                });
                continue;
              }
            }

            const result = await executeTool(tc);
            results.push(result);
          }

          // Add tool result messages
          for (const result of results) {
            this.session.addMessage({
              role: 'tool',
              content: result.content,
              tool_call_id: result.toolCallId,
              name: result.toolName,
            });
          }

          this.callbacks.onToolResult(results);

          // Continue the loop - AI needs to process tool results
          fullContent = '';
          toolCalls = [];
          continue;
        }

        // No tool calls - we're done
        this.session.addMessage({
          role: 'assistant',
          content: fullContent,
        });
        this.callbacks.onDone(fullContent);
        break;
      }

      if (iterations >= maxIterations) {
        this.callbacks.onError(`Reached maximum tool iterations (${maxIterations})`);
      }

      // Save session
      await this.session.save();
    } catch (error) {
      if (!this.abortController?.signal.aborted) {
        this.callbacks.onError(
          error instanceof Error ? error.message : String(error)
        );
      }
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private buildMessages(): ChatMessage[] {
    const wsPath = get(workspacePath) || 'No workspace open';

    let systemContent = `${SYSTEM_PROMPT}\n\nCurrent workspace: ${wsPath}`;

    if (this.workspaceInstructions) {
      systemContent += `\n\n## Workspace Instructions\nThe following instructions were loaded from the workspace root. Follow them when working in this project:\n\n${this.workspaceInstructions}`;
    }

    const systemMessage: ChatMessage = {
      role: 'system',
      content: systemContent,
    };

    return [systemMessage, ...this.session.getMessages()];
  }
}
