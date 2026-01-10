# Context Management Implementation Plan

> **Status:** Planned (Not Yet Implemented)
> **Priority:** High
> **Scope:** Phases 1 + 2 (Visibility + Basic Protection)

---

## Problem Statement

AssistantOS currently has **zero context window management**:

- Full conversation history sent on every API call (unbounded growth)
- No token counting or usage monitoring
- No warning before hitting Claude's 200K token limit
- Hard failure with `context_length_exceeded` error when limit reached
- No recovery mechanism - must start new conversation
- Potential data loss (no auto-save before failure)

---

## Solution Overview

### Phase 1: Visibility
Give users visibility into their context usage with real-time token counting and a visual indicator.

### Phase 2: Basic Protection
Prevent data loss with auto-save, graceful error handling, and manual controls.

### Future Phase 3: Smart Summarization
Automatically compact old messages while preserving meaning (architecture prepared but not in scope).

---

## Implementation Steps

### Step 1.1: Install Dependencies

```bash
npm install js-tiktoken
```

### Step 1.2: Create Token Service

**File:** `src/services/tokenService.ts`

```typescript
import { encoding_for_model } from 'js-tiktoken';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

// Claude uses cl100k_base tokenizer
const encoder = encoding_for_model('cl100k_base');

// Model context limits
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-3-5-20241022': 200000,
};

export interface TokenUsage {
  systemPrompt: number;
  conversationHistory: number;
  toolSchemas: number;
  total: number;
  limit: number;
  percentUsed: number;
  remaining: number;
}

export function countTokens(text: string): number {
  return encoder.encode(text).length;
}

export function countMessageTokens(messages: MessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role overhead: ~4 tokens per message
    total += 4;
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') total += countTokens(block.text);
        if (block.type === 'tool_use') total += countTokens(JSON.stringify(block));
        if (block.type === 'tool_result') total += countTokens(JSON.stringify(block));
      }
    }
  }
  return total;
}

export function getTokenUsage(
  systemPrompt: string,
  messages: MessageParam[],
  toolSchemas: string,
  modelId: string
): TokenUsage {
  const systemTokens = countTokens(systemPrompt);
  const historyTokens = countMessageTokens(messages);
  const toolTokens = countTokens(toolSchemas);
  const total = systemTokens + historyTokens + toolTokens;
  const limit = MODEL_CONTEXT_LIMITS[modelId] || 200000;

  return {
    systemPrompt: systemTokens,
    conversationHistory: historyTokens,
    toolSchemas: toolTokens,
    total,
    limit,
    percentUsed: Math.round((total / limit) * 100),
    remaining: limit - total,
  };
}
```

### Step 1.3: Integrate with Claude Service

**File:** `src/services/claude.ts`

Add to ClaudeService class:

```typescript
import { getTokenUsage, TokenUsage } from './tokenService';

// Add method to get current context usage
public getContextUsage(systemPrompt: string, toolSchemas: string): TokenUsage {
  return getTokenUsage(
    systemPrompt,
    this.conversationHistory,
    toolSchemas,
    this.modelId
  );
}

// Add check before API call in chat() method
const usage = this.getContextUsage(systemPrompt, JSON.stringify(tools));
if (usage.percentUsed >= 95) {
  // Emit warning event or callback
  onContextWarning?.('critical', usage);
}
```

### Step 1.4: Create Context Monitor Component

**File:** `src/components/chat/ContextMonitor.tsx`

```typescript
import React from 'react';
import { TokenUsage } from '@/services/tokenService';

interface ContextMonitorProps {
  usage: TokenUsage | null;
  onClick?: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function getStatusColor(percent: number): string {
  if (percent < 50) return 'text-green-400 bg-green-400/10';
  if (percent < 80) return 'text-yellow-400 bg-yellow-400/10';
  if (percent < 95) return 'text-orange-400 bg-orange-400/10';
  return 'text-red-400 bg-red-400/10';
}

export function ContextMonitor({ usage, onClick }: ContextMonitorProps) {
  if (!usage) return null;

  const colorClass = getStatusColor(usage.percentUsed);

  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium ${colorClass} hover:opacity-80 transition-opacity`}
      title={`System: ${formatTokens(usage.systemPrompt)} | History: ${formatTokens(usage.conversationHistory)} | Tools: ${formatTokens(usage.toolSchemas)}`}
    >
      {formatTokens(usage.total)} / {formatTokens(usage.limit)}
    </button>
  );
}
```

### Step 1.5: Add Warning Toast System

In `AgentChat.tsx`, add warning detection:

```typescript
const [contextWarning, setContextWarning] = useState<'none' | 'warning' | 'critical'>('none');

// Check context before sending
const checkContext = () => {
  const usage = claudeService.getContextUsage(systemPrompt, toolSchemas);
  if (usage.percentUsed >= 95) {
    setContextWarning('critical');
    // Auto-save conversation
    handleSaveConversation();
    // Show toast
    toast.error('Context limit reached! Conversation auto-saved.');
  } else if (usage.percentUsed >= 80) {
    setContextWarning('warning');
    toast.warning('Approaching context limit. Consider saving or starting new conversation.');
  }
  return usage;
};
```

### Step 2.1: Add Graceful Error Handling

In `claude.ts`, wrap API call:

```typescript
try {
  const stream = await this.client.messages.stream({...});
  // ... handle stream
} catch (error: any) {
  if (error?.error?.type === 'context_length_exceeded') {
    throw new ContextOverflowError(
      'Conversation too long. Please save and start a new conversation.',
      this.getContextUsage(systemPrompt, toolSchemas)
    );
  }
  throw error;
}
```

### Step 2.2: Add Manual Controls to Toolbar

**File:** `src/components/chat/ChatToolbar.tsx`

Add buttons:
- **Clear History** - Clears conversation with confirmation
- **New Conversation** - Saves current (optional) and starts fresh

### Step 2.3: Add Settings to Store

**File:** `src/stores/appStore.ts`

```typescript
// Add to state interface
contextWarningThreshold: number;      // Default: 80
autoSaveOnOverflow: boolean;          // Default: true
showContextMonitor: boolean;          // Default: true

// Add to initial state
contextWarningThreshold: 80,
autoSaveOnOverflow: true,
showContextMonitor: true,
```

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/services/tokenService.ts` | Create | Token counting utilities |
| `src/components/chat/ContextMonitor.tsx` | Create | Token usage indicator |
| `src/services/claude.ts` | Modify | Add getContextUsage(), error handling |
| `src/components/chat/AgentChat.tsx` | Modify | Add warnings, auto-save, monitor |
| `src/components/chat/ChatToolbar.tsx` | Modify | Add Clear/New buttons |
| `src/stores/appStore.ts` | Modify | Add context settings |
| `package.json` | Modify | Add js-tiktoken dependency |

---

## Testing Checklist

- [ ] Token counting produces reasonable estimates
- [ ] Context Monitor displays correctly in chat header
- [ ] Color changes at 50%, 80%, 95% thresholds
- [ ] Warning toast appears at 80%
- [ ] Auto-save triggers at 95%
- [ ] Graceful error message on context_length_exceeded
- [ ] Clear History button works with confirmation
- [ ] New Conversation button works
- [ ] Settings persist across sessions

---

## Future Enhancements (Phase 3)

When ready to implement smart summarization:

1. Add summarization prompt to call Claude for message compression
2. Implement bookmark-aware compaction (preserve bookmarked messages)
3. Add conversation linking (continue from summary in new conversation)
4. Add context search (find content in old, compacted messages)
