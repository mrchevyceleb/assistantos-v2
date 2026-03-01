import { get } from 'svelte/store';
import { workspacePath } from '$lib/stores/workspace';
import { readFileText } from '$lib/utils/tauri';
import { streamCompletion } from '../providers/openrouter';
import { executeTool } from '../tools/tool-executor';
import { getAllToolDefinitions, WRITE_TOOLS } from '../tools/tool-definitions';
import { SYSTEM_PROMPT } from '../constants';
import { ChatSession } from './session';
import type {
  ChatMessage,
  ToolCall,
  ToolResult,
  StreamChunk,
  AIChatSettings,
  ChatEngineCallbacks,
  ContextUsage,
} from '../types';

/** File names to look for as workspace instructions (checked in order). */
const INSTRUCTION_FILES = ['AGENTS.MD', 'AGENTS.md', 'agents.md', 'CLAUDE.md', 'CLAUDE.MD', 'claude.md'];
const DEFAULT_CONTEXT_WINDOW = 128000;
const AUTO_COMPACT_THRESHOLD_PERCENT = 95;

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

  getContextUsage(): ContextUsage {
    return this.computeContextUsage(this.buildMessages());
  }

  async compactNow(): Promise<{ usage: ContextUsage; compacted: boolean }> {
    const compacted = await this.compactSession(true);
    return {
      usage: this.getContextUsage(),
      compacted,
    };
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

  async sendMessage(
    userContent: string,
    options?: {
      mentions?: string[];
      steer?: string;
      slashCommandName?: string;
      slashCommandPrompt?: string;
      slashCommandArgs?: string;
    },
  ): Promise<void> {
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

      this.emitContextUsage();

      // Add user message
      let enrichedUserContent = userContent;
      if (options?.slashCommandPrompt) {
        const slashName = options.slashCommandName || 'command';
        const requestText = (options.slashCommandArgs || '').trim() || userContent;
        enrichedUserContent =
          `Slash command /${slashName}:\n${options.slashCommandPrompt}\n\n` +
          `User request:\n${requestText}`;
      }

      if (options?.mentions && options.mentions.length > 0) {
        const mentionLines = options.mentions.map((m) => `- ${m}`).join('\n');
        enrichedUserContent = `Tagged paths:\n${mentionLines}\n\nUser request:\n${enrichedUserContent}`;
      }
      if (options?.steer) {
        enrichedUserContent = `${enrichedUserContent}\n\nSteering:\n${options.steer}`;
      }

      this.session.addMessage({ role: 'user', content: enrichedUserContent });
      await this.compactSession(false);
      this.emitContextUsage();

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
            if (!this.settings.yoloMode && this.settings.confirmWrites && (WRITE_TOOLS.has(tc.function.name) || tc.function.name.startsWith('mcp__'))) {
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
          this.emitContextUsage();

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
        this.emitContextUsage();
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

  private getPromptBudget(): number {
    const contextWindow = Math.max(this.settings.contextWindow || DEFAULT_CONTEXT_WINDOW, 4096);
    const reserve = Math.max(this.settings.maxTokens || 0, 512);
    return Math.max(2048, contextWindow - reserve);
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  private estimateMessageTokens(message: ChatMessage): number {
    let tokens = 6; // message overhead
    if (message.content) {
      tokens += this.estimateTokens(message.content);
    }
    if (message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        tokens += 12;
        tokens += this.estimateTokens(call.function.name || '');
        tokens += this.estimateTokens(call.function.arguments || '');
      }
    }
    if (message.tool_call_id) {
      tokens += this.estimateTokens(message.tool_call_id);
    }
    if (message.name) {
      tokens += this.estimateTokens(message.name);
    }
    return tokens;
  }

  private computeContextUsage(messages: ChatMessage[]): ContextUsage {
    const usedTokens = messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
    const maxTokens = this.getPromptBudget();
    const remainingTokens = Math.max(0, maxTokens - usedTokens);
    const usedPercent = Math.min(100, (usedTokens / maxTokens) * 100);

    return {
      usedTokens,
      maxTokens,
      remainingTokens,
      usedPercent,
    };
  }

  private emitContextUsage(): void {
    this.callbacks.onContextUsage?.(this.getContextUsage());
  }

  private buildCompactionSummary(messages: ChatMessage[]): string {
    const lines: string[] = [];

    for (const message of messages) {
      const role = message.role.toUpperCase();
      const content = (message.content || '').trim().replace(/\s+/g, ' ');
      if (content) {
        lines.push(`${role}: ${content.slice(0, 300)}`);
      }

      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          const args = (call.function.arguments || '').replace(/\s+/g, ' ').slice(0, 180);
          lines.push(`TOOL: ${call.function.name}(${args})`);
        }
      }

      if (lines.length >= 80) break;
    }

    const joined = lines.join('\n').slice(0, 6000);
    if (!joined) {
      return 'Older context was compacted to save room for newer messages.';
    }
    return `Older context was compacted to preserve room for new messages.\n\n${joined}`;
  }

  private async compactSession(force: boolean): Promise<boolean> {
    const usage = this.getContextUsage();
    if (!force && usage.usedPercent < AUTO_COMPACT_THRESHOLD_PERCENT) {
      return false;
    }

    const messages = this.session.getMessages();
    if (messages.length <= 8) {
      return false;
    }

    let keepTailCount = Math.min(12, messages.length - 1);
    keepTailCount = Math.max(6, keepTailCount);
    if (keepTailCount >= messages.length) {
      keepTailCount = messages.length - 1;
    }
    const head = messages.slice(0, messages.length - keepTailCount);
    const tail = messages.slice(-keepTailCount);

    if (head.length === 0) {
      return false;
    }

    const summary = this.buildCompactionSummary(head);
    const compacted: ChatMessage[] = [
      {
        role: 'assistant',
        content: `[Conversation Memory]\n${summary}`,
      },
      ...tail,
    ];

    this.session.replaceMessages(compacted);
    await this.session.save();
    this.callbacks.onCompaction?.(head.length);
    return true;
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
