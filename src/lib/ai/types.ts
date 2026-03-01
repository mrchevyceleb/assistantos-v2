// Core types matching OpenAI API format

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;  // for role='tool' messages
  name?: string;          // tool name for role='tool' messages
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
  isError?: boolean;
}

export type StreamChunkType = 'text' | 'thinking' | 'tool_call' | 'done' | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: ToolCall;
  finishReason?: string | null;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface AIChatSettings {
  provider: 'openrouter' | 'openai' | 'anthropic';
  authMode?: 'apiKey' | 'oauth';
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  contextWindow?: number;
  enableToolUse: boolean;
  confirmWrites: boolean;
  yoloMode?: boolean;
  maxToolIterations: number;
  readInstructionsEachMessage?: boolean;
}

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  usedPercent: number;
}

export const DEFAULT_AI_SETTINGS: AIChatSettings = {
  provider: 'openrouter',
  authMode: 'apiKey',
  apiKey: '',
  model: 'anthropic/claude-sonnet-4',
  baseUrl: 'https://openrouter.ai/api/v1',
  temperature: 0.7,
  maxTokens: 16384,
  contextWindow: 128000,
  enableToolUse: true,
  confirmWrites: true,
  yoloMode: false,
  maxToolIterations: 25,
  readInstructionsEachMessage: true,
};

// UI-specific message type for the chat store
export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming: boolean;
  toolCalls: UIToolCall[];
  timestamp: number;
}

export interface UIToolCall {
  id: string;
  name: string;
  arguments: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  isError?: boolean;
}

export interface ChatEngineCallbacks {
  onChunk: (content: string) => void;
  onThinking?: (content: string) => void;
  onToolCall: (toolCalls: ToolCall[]) => void;
  onToolResult: (results: ToolResult[]) => void;
  onToolConfirmation: (toolCall: ToolCall) => Promise<boolean>;
  onContextUsage?: (usage: ContextUsage) => void;
  onCompaction?: (compactedMessageCount: number) => void;
  onDone: (fullContent: string) => void;
  onError: (error: string) => void;
}
