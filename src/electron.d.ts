// Type declarations for Electron API exposed via preload script

// Webview tag types for built-in browser
declare global {
  namespace Electron {
    interface WebviewTag extends HTMLElement {
      src: string
      loadURL: (url: string) => void
      goBack: () => void
      goForward: () => void
      reload: () => void
      canGoBack: () => boolean
      canGoForward: () => boolean
      stop: () => void
      getURL: () => string
      getTitle: () => string
      addEventListener(event: 'did-start-loading', listener: () => void): void
      addEventListener(event: 'did-stop-loading', listener: () => void): void
      addEventListener(event: 'did-navigate', listener: (e: DidNavigateEvent) => void): void
      addEventListener(event: 'did-navigate-in-page', listener: (e: DidNavigateEvent) => void): void
      addEventListener(event: 'page-title-updated', listener: (e: PageTitleUpdatedEvent) => void): void
      addEventListener(event: 'new-window', listener: (e: NewWindowWebContentsEvent) => void): void
      addEventListener(event: 'did-fail-load', listener: (e: DidFailLoadEvent) => void): void
      addEventListener(event: 'dom-ready', listener: () => void): void
      removeEventListener(event: 'did-start-loading', listener: () => void): void
      removeEventListener(event: 'did-stop-loading', listener: () => void): void
      removeEventListener(event: 'did-navigate', listener: (e: DidNavigateEvent) => void): void
      removeEventListener(event: 'did-navigate-in-page', listener: (e: DidNavigateEvent) => void): void
      removeEventListener(event: 'page-title-updated', listener: (e: PageTitleUpdatedEvent) => void): void
      removeEventListener(event: 'new-window', listener: (e: NewWindowWebContentsEvent) => void): void
      removeEventListener(event: 'did-fail-load', listener: (e: DidFailLoadEvent) => void): void
      removeEventListener(event: 'dom-ready', listener: () => void): void
    }
    interface DidNavigateEvent {
      url: string
    }
    interface PageTitleUpdatedEvent {
      title: string
    }
    interface NewWindowWebContentsEvent {
      url: string
      preventDefault: () => void
    }
    interface DidFailLoadEvent {
      errorCode: number
      errorDescription: string
      validatedURL: string
      isMainFrame: boolean
    }
  }
}

// JSX IntrinsicElements for webview
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          allowpopups?: string | boolean
          partition?: string
          preload?: string
          nodeintegration?: string
          webpreferences?: string
          useragent?: string
          httpreferrer?: string
          disablewebsecurity?: string | boolean
        },
        HTMLElement
      >
    }
  }
}

// Conversation Types
interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
}

interface ConversationData {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  model: string
  messages: ConversationMessage[]
  bookmarks: string[]
  workspace: string | null
}

interface ConversationMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string
}

// MCP Types
interface MCPIntegration {
  id: string
  name: string
  description: string
  mention: string
  mentionAliases?: string[]
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media' | 'custom'
  command: string
  args: string[]
  requiredEnvVars: Array<{
    key: string
    label: string
    type: 'apiKey' | 'oauth' | 'text'
    description?: string
    defaultValue?: string
  }>
  oauth?: {
    provider: 'google'
    scopes: string[]
  }
  toolPrefix: string
  apiKeyUrl?: string
  isCustom?: boolean
  source?: string
}

interface MCPMention {
  mention: string
  integrationId: string
  name: string
  description: string
  isPrimary: boolean
}

interface MCPToolDef {
  name: string
  description: string
  input_schema: object
  integrationId: string
}

interface MCPToolResult {
  success: boolean
  result?: unknown
  error?: string
}

interface MCPServerStatus {
  status: string
  error?: string
  toolCount?: number
}

// Memory Types
interface MemoryProfileUpdate {
  name?: string
  role?: string
  company?: string
  location?: string
  timezone?: string
  communication_style?: string
  tech_stack?: string[]
  key_projects?: string[]
  profile_summary?: string
}

interface MemoryFactInput {
  category: string
  fact: string
  source?: string
  confidence?: number
  conversationId?: string
}

interface MemoryPreferenceInput {
  domain: string
  preference_key: string
  preference_value: unknown
}

interface MemorySummaryInput {
  local_conversation_id: string
  workspace_path?: string
  title: string
  summary: string
  key_decisions?: string[]
  outcomes?: string[]
  problems_solved?: string[]
  message_count?: number
  model_used?: string
  started_at?: string
  ended_at?: string
}

interface MemoryProfile {
  id: string
  user_id: string
  name: string | null
  role: string | null
  company: string | null
  location: string | null
  timezone: string | null
  communication_style: string | null
  tech_stack: string[]
  key_projects: string[]
  profile_summary: string | null
  summary_updated_at: string | null
  created_at: string
  updated_at: string
}

interface MemoryFact {
  id: string
  user_id: string
  category: string
  fact: string
  source: string
  confidence: number
  keywords: string[]
  extracted_from_conversation: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface MemoryPreference {
  id: string
  user_id: string
  domain: string
  preference_key: string
  preference_value: unknown
  observation_count: number
  confidence: number
  first_observed_at: string
  last_observed_at: string
  created_at: string
  updated_at: string
}

interface MemorySummary {
  id: string
  user_id: string
  local_conversation_id: string
  workspace_path: string | null
  title: string
  summary: string
  key_decisions: string[]
  outcomes: string[]
  problems_solved: string[]
  keywords: string[]
  message_count: number | null
  model_used: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

interface MemoryStatus {
  connected: boolean
  factCount: number
  preferenceCount: number
  summaryCount: number
  embeddingsEnabled: boolean
}

interface MemoryContext {
  profile: MemoryProfile | null
  facts: MemoryFact[]
  preferences: MemoryPreference[]
  summaries: MemorySummary[]
}

// Main ElectronAPI Interface
interface ElectronAPI {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  fs: {
    readDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>
    readFile: (filePath: string) => Promise<string | null>
    readFileBase64: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    selectFolder: () => Promise<string | null>
    createDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
    exists: (filePath: string) => Promise<boolean>
    searchFiles: (workspacePath: string, searchTerm: string) => Promise<Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }>>
    searchContent: (workspacePath: string, query: string) => Promise<{
      filenameMatches: Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }>
      contentMatches: Array<{
        filePath: string
        relativePath: string
        fileName: string
        lineNumber: number
        lineContent: string
        matchStart: number
        matchEnd: number
      }>
    }>
    rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
    delete: (targetPath: string) => Promise<{ success: boolean; error?: string }>
    copyPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
    showInExplorer: (filePath: string) => Promise<{ success: boolean; error?: string }>
    getInfo: (filePath: string) => Promise<{ success: boolean; info?: { size: number; isDirectory: boolean; isFile: boolean; created: string; modified: string }; error?: string }>
    glob: (pattern: string, cwd: string, options?: { ignore?: string[]; maxResults?: number }) => Promise<string[]>
    grep: (pattern: string, searchPath: string, options?: {
      include?: string
      exclude?: string
      caseSensitive?: boolean
      maxResults?: number
    }) => Promise<Array<{
      filePath: string
      relativePath: string
      fileName: string
      lineNumber: number
      lineContent: string
      matchStart: number
      matchEnd: number
    }>>
    edit: (filePath: string, oldText: string, newText: string) => Promise<{
      success: boolean
      error?: string
      occurrences?: number
      replaced?: number
      charDiff?: number
    }>
  }
  bash: {
    execute: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  }
  shell: {
    openExternal: (url: string) => Promise<boolean>
    showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
    openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  }
  workspace: {
    setPath: (workspacePath: string | null) => Promise<{ success: boolean }>
  }
  mcp: {
    getIntegrations: () => Promise<MCPIntegration[]>
    getMentionMap: () => Promise<Record<string, string>>
    getAllMentions: () => Promise<MCPMention[]>
    configure: (integrationId: string, config: Record<string, string>) => Promise<{ success: boolean; error?: string }>
    start: (integrationId: string) => Promise<{ success: boolean; error?: string }>
    stop: (integrationId: string) => Promise<{ success: boolean; error?: string }>
    isReady: (integrationId: string) => Promise<boolean>
    getTools: (integrationIds: string[]) => Promise<MCPToolDef[]>
    executeTool: (integrationId: string, toolName: string, input: Record<string, unknown>) => Promise<MCPToolResult>
    findIntegrationForTool: (toolName: string) => Promise<string | undefined>
    getStatus: () => Promise<Record<string, MCPServerStatus>>
    getConfig: (integrationId: string) => Promise<Record<string, string>>
    preStartEnabled: (configs: Record<string, { enabled: boolean; envVars: Record<string, string> }>) => Promise<{ success: boolean; error?: string }>
    getCustomIntegrations: () => Promise<MCPIntegration[]>
    registerCustomIntegration: (integration: MCPIntegration) => Promise<{ success: boolean; error?: string }>
    unregisterCustomIntegration: (integrationId: string) => Promise<{ success: boolean; error?: string }>
    updateCustomIntegration: (id: string, updates: Partial<MCPIntegration>) => Promise<{ success: boolean; error?: string }>
    loadCustomIntegrations: (integrations: MCPIntegration[]) => Promise<{ success: boolean }>
    // OAuth methods
    startOAuth: (integrationId: string) => Promise<{ success: boolean; tokens?: { accessToken: string; refreshToken: string; expiresAt: number }; error?: string }>
    hasOAuthTokens: (integrationId: string) => Promise<boolean>
    clearOAuthTokens: (integrationId: string) => Promise<{ success: boolean; error?: string }>
    // Event listeners
    on?: (channel: string, callback: (data: any) => void) => void
    off?: (channel: string, callback: (data: any) => void) => void
    // Gmail Account Management
    addGmailAccount: (label: string) => Promise<{ success: boolean; account?: any; error?: string }>
    removeGmailAccount: (accountId: string, integrationId: string) => Promise<{ success: boolean; error?: string }>
    initializeGmailAccountCredentials: (accountId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => Promise<{ success: boolean; envVars?: Record<string, string>; error?: string }>
    registerVirtualGmailAccount: (accountId: string, label: string, email: string) => Promise<{ success: boolean; error?: string }>
  }
  app: {
    getVersion: () => Promise<string>
    getHomeDir: () => Promise<string>
    getEnv: (key: string) => Promise<string | null>
  }
  conversation: {
    save: (conversation: ConversationData) => Promise<{ success: boolean; id?: string; error?: string }>
    load: (conversationId: string) => Promise<ConversationData | null>
    list: () => Promise<ConversationMeta[]>
    delete: (conversationId: string) => Promise<{ success: boolean; error?: string }>
    export: (markdown: string, suggestedName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>
  }
  memory: {
    initialize: (url: string, anonKey: string, anonymousId: string) => Promise<{ success: boolean; userId?: string; error?: string }>
    getStatus: () => Promise<MemoryStatus>
    disconnect: () => Promise<{ success: boolean }>
    setOpenaiKey: (apiKey: string) => Promise<{ success: boolean; embeddingsEnabled: boolean }>
    isEmbeddingsEnabled: () => Promise<boolean>
    getProfile: () => Promise<MemoryProfile | null>
    updateProfile: (updates: MemoryProfileUpdate) => Promise<MemoryProfile | null>
    getFacts: (category?: string) => Promise<MemoryFact[]>
    addFact: (fact: MemoryFactInput) => Promise<MemoryFact | null>
    addFacts: (facts: MemoryFactInput[]) => Promise<MemoryFact[]>
    deleteFact: (factId: string) => Promise<boolean>
    searchFacts: (query: string, limit?: number) => Promise<MemoryFact[]>
    getPreferences: (domain?: string) => Promise<MemoryPreference[]>
    upsertPreference: (pref: MemoryPreferenceInput) => Promise<MemoryPreference | null>
    deletePreference: (prefId: string) => Promise<boolean>
    getSummaries: (workspacePath?: string) => Promise<MemorySummary[]>
    addSummary: (summary: MemorySummaryInput) => Promise<MemorySummary | null>
    searchSummaries: (query: string, limit?: number) => Promise<MemorySummary[]>
    getRelevantMemories: (query: string) => Promise<MemoryContext>
  }
  updater?: {
    getStatus: () => Promise<UpdateStatus>
    checkForUpdates: () => Promise<{ success: boolean; error?: string }>
    installUpdate: () => Promise<void>
    onUpdateEvent: (callback: (event: UpdateEventType, data: unknown) => void) => (() => void)
  }
  sync?: {
    initialize: () => Promise<{ success: boolean; config?: SyncConfig; error?: string }>
    getStatus: () => Promise<SyncStatus>
    getConfig: () => Promise<SyncConfig | null>
    setEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>
    updateDeviceName: (name: string) => Promise<{ success: boolean; error?: string }>
    // Device linking
    generatePairingCode: () => Promise<{ success: boolean; code?: string; expiresAt?: string; error?: string }>
    linkWithCode: (code: string) => Promise<{ success: boolean; config?: SyncConfig; error?: string }>
    getLinkedDevices: () => Promise<{ success: boolean; devices: SyncDevice[]; error?: string }>
    removeDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>
    // Settings sync
    pushSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    pullSettings: () => Promise<{ success: boolean; settings?: SyncSettings | null; error?: string }>
    // Conversation sync
    pushConversation: (conversationId: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    pullConversations: () => Promise<{ success: boolean; conversations: Array<{ conversation_id: string; data: Record<string, unknown>; updated_at: string }>; error?: string }>
    deleteConversation: (conversationId: string) => Promise<{ success: boolean; error?: string }>
    // Event listeners
    onEvent: (callback: (event: SyncEvent) => void) => () => void
  }
  safeStorage?: {
    setCredential: (key: string, value: string) => Promise<{ success: boolean; error?: string }>
    getCredential: (key: string) => Promise<{ success: boolean; value?: string | null; error?: string }>
    deleteCredential: (key: string) => Promise<{ success: boolean; error?: string }>
    listKeys: () => Promise<{ success: boolean; keys?: string[]; error?: string }>
  }
  anthropic: {
    validateKey: (apiKey: string) => Promise<{ valid: boolean; error?: string }>
    createMessage: (params: {
      apiKey: string
      model: string
      maxTokens: number
      messages: Array<{ role: string; content: unknown }>
      system?: string
      tools?: unknown[]
    }) => Promise<{ success: boolean; data?: unknown; error?: string }>
    streamMessage: (params: {
      streamId: string
      apiKey: string
      model: string
      maxTokens: number
      messages: Array<{ role: string; content: unknown }>
      system?: string
      tools?: unknown[]
    }) => Promise<{ success: boolean; error?: string }>
    cancelStream: (streamId: string) => Promise<{ success: boolean; error?: string }>
    onStreamEvent: (streamId: string, callback: (data: { type: string; event?: unknown; message?: unknown; error?: string }) => void) => () => void
  }
}

// Sync types
interface SyncConfig {
  syncId: string
  deviceId: string
  enabled: boolean
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  platform: string
  lastSyncAt: string | null
}

interface SyncStatus {
  connected: boolean
  syncing: boolean
  lastSyncAt: string | null
  deviceCount: number
  error: string | null
}

interface SyncDevice {
  id: string
  sync_id: string
  device_name: string | null
  device_type: string
  platform: string | null
  last_seen: string
  created_at: string
}

interface SyncSettings {
  sync_id: string
  settings: Record<string, unknown>
  version: number
  updated_at: string
  updated_by: string | null
}

interface SyncEvent {
  type: string
  payload: unknown
  deviceId: string
  timestamp: string
}

// Update types
interface UpdateStatus {
  checking: boolean
  available: boolean
  downloaded: boolean
  version: string | null
  progress: number | null
  error: string | null
}

type UpdateEventType = 'update-checking' | 'update-available' | 'update-not-available' | 'update-progress' | 'update-downloaded' | 'update-error'

// Window interface extension
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
