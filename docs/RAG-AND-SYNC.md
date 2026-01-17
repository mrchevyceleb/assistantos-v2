# RAG and Sync Systems in AssistantOS

This document provides a comprehensive overview of the Retrieval-Augmented Generation (RAG), persistent memory, and cloud sync systems in AssistantOS. These systems work together to provide personalized AI assistance that remembers user context across conversations and syncs seamlessly across multiple devices.

---

## Table of Contents

1. [Overview](#overview)
2. [Memory System Architecture](#memory-system-architecture)
3. [Cloud Sync System](#cloud-sync-system)
4. [Task Sync System](#task-sync-system)
5. [How RAG Works](#how-rag-works)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Configuration and Setup](#configuration-and-setup)
8. [Database Schema Reference](#database-schema-reference)

---

## Overview

AssistantOS implements three interconnected systems for persistent, cross-device AI assistance:

| System | Purpose | Backend |
|--------|---------|---------|
| **Memory System** | Stores user profile, facts, preferences, and conversation summaries for RAG | Supabase (PostgreSQL) |
| **Cloud Sync** | Syncs settings, conversations, and device linking across installations | Supabase (PostgreSQL + Realtime) |
| **Task Sync** | Syncs task management data across devices | Supabase (PostgreSQL + Realtime) |

All three systems share a common Supabase backend and use anonymous UUIDs for user identification, enabling privacy-first cross-device sync without requiring user accounts.

### Key Features

- **Privacy-First**: Anonymous UUID-based identification, no user accounts required
- **Cross-Device Sync**: Device pairing via temporary codes, real-time updates
- **RAG Context Injection**: Relevant memories injected into system prompt (~1000 token budget)
- **Optional Embeddings**: OpenAI embeddings for semantic search (keyword fallback if unavailable)
- **Encrypted Storage**: Local config encrypted via Electron safeStorage API

---

## Memory System Architecture

The memory system provides persistent, personalized context that enhances AI responses by remembering information about the user across conversations.

### Components Overview

```
src/services/memory/
  |-- types.ts            # Type definitions
  |-- constants.ts        # Configuration loading
  |-- supabaseClient.ts   # Supabase connection management
  |-- memoryService.ts    # Main CRUD service
  |-- extractionService.ts # Fact/preference extraction
  |-- retrievalService.ts # RAG retrieval logic
  |-- index.ts            # Module exports

electron/memory/
  |-- embeddingService.ts # OpenAI embedding generation
  |-- ipcHandlers.ts      # IPC bridge for renderer process
```

### Data Types

#### 1. User Profile (~400 tokens)
The core user profile is always included in context injection.

```typescript
interface UserProfile {
  id: string
  userId: string
  name?: string
  role?: string                    // e.g., "Software Engineer"
  company?: string
  location?: string
  timezone?: string
  communicationStyle?: 'direct' | 'detailed' | 'casual'
  techStack: string[]              // e.g., ["React", "TypeScript", "Node.js"]
  keyProjects: string[]
  profileSummary?: string
  createdAt: string
  updatedAt: string
}
```

#### 2. User Facts (~300 tokens budget)
Explicit and inferred facts about the user, extracted from conversations.

```typescript
interface UserFact {
  id: string
  userId: string
  category: 'personal' | 'work' | 'project' | 'preference'
  fact: string                     // e.g., "Works at Acme Corp"
  source: 'explicit' | 'inferred'  // How the fact was learned
  confidence: number               // 0.0 - 1.0
  keywords: string[]               // For search indexing
  embedding?: number[]             // Optional 1536-dim vector
  isActive: boolean                // Soft delete flag
  createdAt: string
  updatedAt: string
}
```

#### 3. User Preferences (~100 tokens budget)
Learned behavioral patterns and preferences.

```typescript
interface UserPreference {
  id: string
  userId: string
  domain: 'coding' | 'writing' | 'communication' | 'tools' | 'ui'
  preferenceKey: string            // e.g., "indentation"
  preferenceValue: unknown         // e.g., "tabs" or { size: 2 }
  observationCount: number         // How many times observed
  confidence: number               // Increases with observations
  firstObservedAt: string
  lastObservedAt: string
}
```

#### 4. Conversation Summaries (~200 tokens budget)
Compressed records of past conversations for context.

```typescript
interface ConversationSummary {
  id: string
  userId: string
  localConversationId: string
  workspacePath?: string
  title: string
  summary: string
  keyDecisions: string[]
  outcomes: string[]
  problemsSolved: string[]
  keywords: string[]               // For search indexing
  embedding?: number[]             // Optional 1536-dim vector
  messageCount?: number
  modelUsed?: string
  createdAt: string
}
```

### Token Budget

The memory system operates within a ~1000 token budget to avoid consuming too much context window:

| Component | Budget |
|-----------|--------|
| Core Profile | ~400 tokens |
| Relevant Facts | ~300 tokens |
| Preferences | ~100 tokens |
| Related Summaries | ~200 tokens |
| **Total** | **~1000 tokens** |

---

## Cloud Sync System

The cloud sync system enables multi-device synchronization of settings and conversations without requiring user accounts.

### Architecture

```
electron/services/sync/
  |-- types.ts         # Type definitions
  |-- syncService.ts   # Core sync coordinator (singleton)
  |-- ipcHandlers.ts   # IPC bridge for renderer
  |-- index.ts         # Module exports
```

### How Device Linking Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVICE LINKING FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DEVICE A (existing)              DEVICE B (new)                    │
│  ────────────────────             ──────────────                    │
│                                                                     │
│  1. User clicks "Add Device"                                        │
│     ↓                                                               │
│  2. Generate pairing code ─────────────────────────────────────→    │
│     (6-char code, expires in 5 min)                                 │
│     │                                                               │
│     │                             3. User enters code               │
│     │                                ↓                              │
│     ├────────────────────────────→ 4. Consume pairing code          │
│     │  (code contains encrypted       ↓                             │
│     │   sync_id + secret_key)      5. Decrypt secret_key            │
│     │                                ↓                              │
│     │                             6. Create local config with       │
│     │                                same sync_id                   │
│     │                                ↓                              │
│  ←──┴─────────────────────────────7. Register device with server    │
│                                                                     │
│  Both devices now share the same sync_id namespace                  │
│  and can sync settings/conversations in real-time                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Sync Configuration

Local sync configuration stored in `%APPDATA%/assistantos/sync-config.json` (encrypted):

```typescript
interface SyncConfig {
  syncId: string          // UUID grouping all user devices
  deviceId: string        // This device's unique ID
  secretKey: string       // Encryption key (base64)
  enabled: boolean
  deviceName: string      // e.g., "MyPC-Windows"
  deviceType: 'desktop' | 'mobile'
  platform: string        // e.g., "win32", "darwin", "linux"
  lastSyncAt: string | null
}
```

### What Gets Synced

| Data Type | Sync Method | Real-time |
|-----------|-------------|-----------|
| App Settings | Push/Pull via `sync_settings` table | Yes |
| Conversations | Push/Pull via `sync_conversations` table | Yes |
| Device List | Managed via `sync_devices` table | No |

### Real-time Subscriptions

The sync service subscribes to Supabase Realtime for live updates:

```typescript
// Subscribes to changes in sync_settings and sync_conversations
// filtered by sync_id
channel = supabase
  .channel(`sync:${syncId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'sync_settings',
    filter: `sync_id=eq.${syncId}`
  }, handleSettingsUpdate)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'sync_conversations',
    filter: `sync_id=eq.${syncId}`
  }, handleConversationUpdate)
  .subscribe()
```

---

## Task Sync System

The task sync system provides cloud-based task management that syncs across devices in real-time.

### Architecture

```
src/services/tasks/
  |-- taskSyncService.ts  # CRUD operations + realtime subscriptions

src/types/
  |-- syncTask.ts         # Type definitions and converters
```

### Task Data Structure

```typescript
interface SyncTask {
  id: string                       // UUID from Supabase
  syncId: string                   // User's namespace

  // Content
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done' | 'blocked'

  // Organization
  projectName: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string                 // YYYY-MM-DD format
  documentPath?: string            // Links to workspace file

  // Ordering
  sortOrder: number                // For Kanban column ordering

  // Flexible data
  tags: string[]
  metadata: Record<string, unknown>

  // Timestamps
  createdAt: string
  updatedAt: string
  completedAt?: string
}
```

### Real-time Task Sync

```typescript
// Subscribe to task changes for a sync namespace
async function subscribeToTasks(
  syncId: string,
  callbacks: {
    onInsert?: (task: SyncTask) => void
    onUpdate?: (task: SyncTask) => void
    onDelete?: (taskId: string) => void
  }
): Promise<() => void>
```

### Migration from File-Based Tasks

AssistantOS supports importing existing file-based tasks into the cloud system:

```typescript
interface FileTask {
  title: string
  status: TaskStatus
  projectName: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  filePath?: string
  description?: string
  tags?: string[]
}

// Import file-based tasks
const result = await importFileBasedTasks(syncId, fileTasks)
// result: { imported: number, failed: number, errors: string[] }
```

---

## How RAG Works

RAG (Retrieval-Augmented Generation) enhances Claude's responses by injecting relevant user memories into the system prompt.

### The RAG Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RAG PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. USER MESSAGE                                                    │
│     "Help me refactor the authentication module"                    │
│     ↓                                                               │
│  2. KEYWORD EXTRACTION                                              │
│     ["refactor", "authentication", "module"]                        │
│     ↓                                                               │
│  3. OPTIONAL: EMBEDDING GENERATION                                  │
│     If OpenAI key configured:                                       │
│     text → text-embedding-3-small → [1536-dim vector]               │
│     ↓                                                               │
│  4. MEMORY RETRIEVAL                                                │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ If embeddings available:                                │     │
│     │   • Semantic search via pgvector (cosine similarity)   │     │
│     │                                                        │     │
│     │ Fallback (keyword search):                             │     │
│     │   • PostgreSQL array overlap on keywords column        │     │
│     └─────────────────────────────────────────────────────────┘     │
│     ↓                                                               │
│  5. RELEVANCE SCORING                                               │
│     Score = (keyword_overlap × 0.6) + (confidence × 0.4)            │
│     Filter: facts with score > 0.2                                  │
│     ↓                                                               │
│  6. TOKEN BUDGET MANAGEMENT                                         │
│     ┌───────────────────┬──────────┐                               │
│     │ Profile           │ 400      │                               │
│     │ Top 5 facts       │ 300      │                               │
│     │ Top 10 prefs      │ 100      │                               │
│     │ Top 2 summaries   │ 200      │                               │
│     │ TOTAL             │ ~1000    │                               │
│     └───────────────────┴──────────┘                               │
│     ↓                                                               │
│  7. SYSTEM PROMPT INJECTION                                         │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │ ## User Profile & Memory                               │     │
│     │                                                        │     │
│     │ ### About the User                                     │     │
│     │ - Name: John                                           │     │
│     │ - Role: Senior Developer at Acme Corp                  │     │
│     │ - Tech Stack: React, TypeScript, Node.js               │     │
│     │                                                        │     │
│     │ ### Things You Know About Them                         │     │
│     │ - Works on the authentication service refactoring      │     │
│     │ - Prefers functional components over class components  │     │
│     │                                                        │     │
│     │ ### Known Preferences                                  │     │
│     │ - indentation (coding): tabs                          │     │
│     │ - verbosity (communication): concise                   │     │
│     └─────────────────────────────────────────────────────────┘     │
│     ↓                                                               │
│  8. CLAUDE RESPONSE                                                 │
│     Claude now has personalized context about the user              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Fact Extraction

Facts are extracted from user messages using pattern matching:

```typescript
// Example patterns (from extractionService.ts)
const FACT_PATTERNS = {
  personal: [
    { pattern: /my name is (\w+)/i, template: "User's name is $1" },
    { pattern: /i live in ([^,.\n]+)/i, template: "Lives in $1" },
  ],
  work: [
    { pattern: /i work (?:at|for) ([^,.\n]+)/i, template: "Works at $1" },
    { pattern: /i'm a ([^,.\n]+) (?:at|for|working)/i, template: "Role is $1" },
  ],
  project: [
    { pattern: /(?:we|i) use ([^,.\n]+) for (?:our |the )?([^,.\n]+)/i, template: "Uses $1 for $2" },
  ],
  preference: [
    { pattern: /i prefer ([^,.\n]+) (?:over|to|instead)/i, template: "Prefers $1" },
  ],
}
```

### Preference Learning

Preferences are learned from behavioral patterns and explicit statements:

```typescript
// Example preference patterns
const PREFERENCE_PATTERNS = [
  { pattern: /(?:use|prefer) (tabs|spaces)/i, domain: 'coding', key: 'indentation' },
  { pattern: /(?:prefer|use) (single|double) quotes/i, domain: 'coding', key: 'quotes' },
  { pattern: /(?:keep it|be) (brief|concise|detailed)/i, domain: 'communication', key: 'verbosity' },
]
```

### Semantic Search (Optional)

When an OpenAI API key is configured, the system uses vector embeddings for semantic search:

```typescript
// Generate embedding
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
  dimensions: 1536,
})

// Search via Supabase RPC (uses pgvector extension)
const { data } = await supabase.rpc('search_facts_by_embedding', {
  p_user_id: userId,
  p_query_embedding: formatEmbedding(queryVector),
  p_limit: 5,
  p_min_similarity: 0.3,
})
```

### Trivial Message Detection

Trivial messages skip memory retrieval to save resources:

```typescript
function isTrivialMessage(message: string): boolean {
  const trivialPatterns = [
    /^(hi|hello|hey|yo|sup)[\s!.,]*$/i,
    /^(thanks|thank you|thx|ty)[\s!.,]*$/i,
    /^(ok|okay|sure|yes|no|yeah|yep|nope)[\s!.,]*$/i,
  ]
  // Returns true if message matches any trivial pattern
}
```

---

## Data Flow Diagrams

### Memory Write Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      MEMORY WRITE FLOW                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Conversation                                                    │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ extractFactsFrom-   │                                        │
│  │ Message()           │ ─→ Pattern matching on user messages   │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ extractPreferences- │                                        │
│  │ FromMessage()       │ ─→ Pattern matching for behaviors      │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ generateConversation│                                        │
│  │ Summary()           │ ─→ Compress conversation to summary    │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐     ┌─────────────────────┐            │
│  │ generateEmbedding() │ ──→ │ OpenAI API          │ (optional) │
│  │ (if key configured) │     │ text-embedding-3-   │            │
│  └─────────────────────┘     │ small (1536 dims)   │            │
│       │                      └─────────────────────┘            │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ Supabase Insert     │                                        │
│  │ (IPC Handler)       │                                        │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ PostgreSQL Tables:  │                                        │
│  │ • user_facts        │                                        │
│  │ • user_preferences  │                                        │
│  │ • conversation_     │                                        │
│  │   summaries         │                                        │
│  └─────────────────────┘                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Memory Read Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      MEMORY READ FLOW                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Message                                                    │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ isTrivialMessage()  │ ─→ Skip if trivial (hi, thanks, etc)   │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ extractQueryKeywords│ ─→ ["refactor", "auth", "module"]      │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ├───────────────────────────────────────┐                  │
│       ↓                                       ↓                  │
│  [If embeddings enabled]              [Keyword fallback]         │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │ generateEmbedding() │         │ Supabase query with │        │
│  │ for query           │         │ keywords OVERLAPS   │        │
│  └─────────────────────┘         └─────────────────────┘        │
│       │                                       │                  │
│       ↓                                       │                  │
│  ┌─────────────────────┐                      │                  │
│  │ search_facts_by_    │                      │                  │
│  │ embedding() RPC     │                      │                  │
│  │ (pgvector cosine)   │                      │                  │
│  └─────────────────────┘                      │                  │
│       │                                       │                  │
│       └───────────────────┬───────────────────┘                  │
│                           ↓                                      │
│                  ┌─────────────────────┐                        │
│                  │ Score & Rank        │                        │
│                  │ Apply token budget  │                        │
│                  └─────────────────────┘                        │
│                           │                                      │
│                           ↓                                      │
│                  ┌─────────────────────┐                        │
│                  │ MemoryContext {     │                        │
│                  │   profile,          │                        │
│                  │   facts,            │                        │
│                  │   preferences,      │                        │
│                  │   summaries         │                        │
│                  │ }                   │                        │
│                  └─────────────────────┘                        │
│                           │                                      │
│                           ↓                                      │
│                  ┌─────────────────────┐                        │
│                  │ buildMemorySection()│                        │
│                  │ → Markdown string   │                        │
│                  └─────────────────────┘                        │
│                           │                                      │
│                           ↓                                      │
│                  ┌─────────────────────┐                        │
│                  │ Inject into System  │                        │
│                  │ Prompt              │                        │
│                  └─────────────────────┘                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Cloud Sync Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    CLOUD SYNC DATA FLOW                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Device A (Settings Change)                                      │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────┐                                        │
│  │ pushSettings()      │                                        │
│  └─────────────────────┘                                        │
│       │                                                          │
│       ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SUPABASE                             │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │ sync_settings                                   │   │    │
│  │  │ ─────────────                                   │   │    │
│  │  │ sync_id | settings | updated_at | updated_by    │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                         │                               │    │
│  │                         ↓                               │    │
│  │              ┌─────────────────────┐                   │    │
│  │              │ Realtime Channel    │                   │    │
│  │              │ (postgres_changes)  │                   │    │
│  │              └─────────────────────┘                   │    │
│  │                         │                               │    │
│  └─────────────────────────│───────────────────────────────┘    │
│                            │                                     │
│       ┌────────────────────┼────────────────────┐               │
│       ↓                    ↓                    ↓               │
│  ┌─────────┐         ┌─────────┐         ┌─────────┐           │
│  │Device A │         │Device B │         │Device C │           │
│  │(ignored)│         │(receive)│         │(receive)│           │
│  └─────────┘         └─────────┘         └─────────┘           │
│                            │                    │               │
│                            ↓                    ↓               │
│                      ┌─────────────────────────────────┐       │
│                      │ 'sync:event' IPC to renderer    │       │
│                      │ → Apply settings to UI          │       │
│                      └─────────────────────────────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Configuration and Setup

### Environment Variables

Create a `.env` file in the project root:

```env
# Memory System (Optional - hardcoded defaults exist)
MEMORY_SUPABASE_URL=https://your-project.supabase.co
MEMORY_SUPABASE_ANON_KEY=your-anon-key

# Embeddings (Optional - enables semantic search)
OPENAI_API_KEY=sk-your-openai-key
```

### Enabling Memory

Memory is enabled by default when the app starts. The system:

1. Generates or loads an anonymous user ID
2. Connects to Supabase
3. Creates a user profile if none exists
4. Begins extracting facts/preferences from conversations

### Enabling Embeddings

To enable semantic search (recommended for better retrieval):

1. Add your OpenAI API key in Settings > Claude > OpenAI Key
2. The system will automatically start generating embeddings for new facts/summaries
3. Existing facts can be backfilled with embeddings

### Device Linking

To sync AssistantOS across multiple devices:

1. On Device A: Settings > Sync > Add Device > Generate Code
2. Copy the 6-character code (valid for 5 minutes)
3. On Device B: Settings > Sync > Link Device > Enter Code
4. Both devices are now synced

### Customizing Token Budget

The default token budget can be modified in `src/services/memory/retrievalService.ts`:

```typescript
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  profile: 400,      // Core user profile
  facts: 300,        // Relevant facts
  preferences: 100,  // Active preferences
  summaries: 200,    // Related summaries
  total: 1000,       // Maximum total
}
```

---

## Database Schema Reference

### Memory Tables

```sql
-- User identification (anonymous UUID)
CREATE TABLE memory_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profile
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id),
  name TEXT,
  role TEXT,
  company TEXT,
  location TEXT,
  timezone TEXT,
  communication_style TEXT,
  tech_stack TEXT[],
  key_projects TEXT[],
  profile_summary TEXT,
  summary_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User facts with optional embeddings
CREATE TABLE user_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id),
  category TEXT NOT NULL,
  fact TEXT NOT NULL,
  source TEXT DEFAULT 'explicit',
  confidence FLOAT DEFAULT 1.0,
  embedding VECTOR(1536),  -- pgvector extension
  keywords TEXT[],
  extracted_from_conversation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id),
  domain TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB,
  observation_count INT DEFAULT 1,
  confidence FLOAT DEFAULT 0.5,
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain, preference_key)
);

-- Conversation summaries with optional embeddings
CREATE TABLE conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES memory_users(id),
  local_conversation_id TEXT NOT NULL,
  workspace_path TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_decisions TEXT[],
  outcomes TEXT[],
  problems_solved TEXT[],
  embedding VECTOR(1536),
  keywords TEXT[],
  message_count INT,
  model_used TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Sync Tables

```sql
-- Linked devices
CREATE TABLE sync_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,
  device_name TEXT,
  device_type TEXT DEFAULT 'desktop',
  platform TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings sync
CREATE TABLE sync_settings (
  sync_id UUID PRIMARY KEY,
  settings JSONB NOT NULL,
  version INT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Conversation sync
CREATE TABLE sync_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  agent_id TEXT,
  title TEXT,
  data JSONB NOT NULL,
  message_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sync_id, conversation_id)
);

-- Device pairing codes
CREATE TABLE pairing_codes (
  code TEXT PRIMARY KEY,
  sync_id UUID NOT NULL,
  secret_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Task Sync Table

```sql
CREATE TABLE sync_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  project_name TEXT NOT NULL,
  priority TEXT,
  due_date DATE,
  document_path TEXT,
  sort_order INT DEFAULT 0,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Database Functions

```sql
-- Get or create memory user
CREATE FUNCTION get_or_create_memory_user(p_anonymous_id TEXT)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM memory_users WHERE anonymous_id = p_anonymous_id;
  IF v_user_id IS NULL THEN
    INSERT INTO memory_users (anonymous_id) VALUES (p_anonymous_id) RETURNING id INTO v_user_id;
    INSERT INTO user_profiles (user_id) VALUES (v_user_id);
  ELSE
    UPDATE memory_users SET last_seen_at = NOW() WHERE id = v_user_id;
  END IF;
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Semantic search for facts
CREATE FUNCTION search_facts_by_embedding(
  p_user_id UUID,
  p_query_embedding VECTOR(1536),
  p_limit INT DEFAULT 5,
  p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (id UUID, category TEXT, fact TEXT, confidence FLOAT, similarity FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.category, f.fact, f.confidence,
         1 - (f.embedding <=> p_query_embedding) AS similarity
  FROM user_facts f
  WHERE f.user_id = p_user_id
    AND f.is_active = TRUE
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY f.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

---

## Summary

The RAG and sync systems in AssistantOS provide:

1. **Persistent Memory**: Facts, preferences, and conversation summaries stored in Supabase
2. **Intelligent Retrieval**: Keyword-based with optional semantic search via embeddings
3. **Token-Budgeted Injection**: ~1000 tokens of relevant context per message
4. **Cross-Device Sync**: Anonymous device linking with real-time updates
5. **Task Management**: Cloud-synced tasks with Kanban board support

This architecture enables AssistantOS to provide increasingly personalized assistance while respecting user privacy through anonymous identification.
