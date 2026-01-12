import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // File system operations
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    readFileBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileBase64', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
    searchFiles: (workspacePath: string, searchTerm: string) => ipcRenderer.invoke('fs:searchFiles', workspacePath, searchTerm),
    searchContent: (workspacePath: string, query: string) => ipcRenderer.invoke('fs:searchContent', workspacePath, query),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    copyPath: (filePath: string) => ipcRenderer.invoke('fs:copyPath', filePath),
    showInExplorer: (filePath: string) => ipcRenderer.invoke('fs:showInExplorer', filePath),
    getInfo: (filePath: string) => ipcRenderer.invoke('fs:getInfo', filePath),
  },

  // Bash command execution
  bash: {
    execute: (command: string, cwd: string) => ipcRenderer.invoke('bash:execute', command, cwd),
  },

  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    installUpdate: () => ipcRenderer.invoke('updater:installUpdate'),
    onUpdateEvent: (callback: (event: string, data?: unknown) => void) => {
      const channels = [
        'auto-update:update-checking',
        'auto-update:update-available',
        'auto-update:update-not-available',
        'auto-update:update-progress',
        'auto-update:update-downloaded',
        'auto-update:update-error'
      ]
      channels.forEach(channel => {
        ipcRenderer.on(channel, (_, data) => callback(channel.replace('auto-update:', ''), data))
      })
      return () => {
        channels.forEach(channel => ipcRenderer.removeAllListeners(channel))
      }
    }
  },

  // Workspace management (for security validation)
  workspace: {
    setPath: (workspacePath: string | null) => ipcRenderer.invoke('workspace:setPath', workspacePath),
  },

  // MCP integrations
  mcp: {
    getIntegrations: () => ipcRenderer.invoke('mcp:getIntegrations'),
    getMentionMap: () => ipcRenderer.invoke('mcp:getMentionMap'),
    getAllMentions: () => ipcRenderer.invoke('mcp:getAllMentions'),
    configure: (integrationId: string, config: Record<string, string>) =>
      ipcRenderer.invoke('mcp:configure', integrationId, config),
    start: (integrationId: string) => ipcRenderer.invoke('mcp:start', integrationId),
    stop: (integrationId: string) => ipcRenderer.invoke('mcp:stop', integrationId),
    isReady: (integrationId: string) => ipcRenderer.invoke('mcp:isReady', integrationId),
    getTools: (integrationIds: string[]) => ipcRenderer.invoke('mcp:getTools', integrationIds),
    executeTool: (integrationId: string, toolName: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:executeTool', integrationId, toolName, input),
    findIntegrationForTool: (toolName: string) => ipcRenderer.invoke('mcp:findIntegrationForTool', toolName),
    getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
    getConfig: (integrationId: string) => ipcRenderer.invoke('mcp:getConfig', integrationId),
    preStartEnabled: (configs: Record<string, { enabled: boolean; envVars: Record<string, string> }>) =>
      ipcRenderer.invoke('mcp:preStartEnabled', configs),
    // Custom integration handlers
    getCustomIntegrations: () => ipcRenderer.invoke('mcp:getCustomIntegrations'),
    registerCustomIntegration: (integration: MCPIntegration) =>
      ipcRenderer.invoke('mcp:registerCustomIntegration', integration),
    unregisterCustomIntegration: (integrationId: string) =>
      ipcRenderer.invoke('mcp:unregisterCustomIntegration', integrationId),
    updateCustomIntegration: (id: string, updates: Partial<MCPIntegration>) =>
      ipcRenderer.invoke('mcp:updateCustomIntegration', id, updates),
    loadCustomIntegrations: (integrations: MCPIntegration[]) =>
      ipcRenderer.invoke('mcp:loadCustomIntegrations', integrations),
  },

  // Conversation persistence
  conversation: {
    save: (conversation: ConversationData) =>
      ipcRenderer.invoke('conversation:save', conversation),
    load: (conversationId: string) =>
      ipcRenderer.invoke('conversation:load', conversationId),
    list: () =>
      ipcRenderer.invoke('conversation:list'),
    delete: (conversationId: string) =>
      ipcRenderer.invoke('conversation:delete', conversationId),
    export: (markdown: string, suggestedName: string) =>
      ipcRenderer.invoke('conversation:export', markdown, suggestedName),
  },
  // Memory system (persistent cross-device memory)
  memory: {
    initialize: (anonymousId: string) =>
      ipcRenderer.invoke('memory:initialize', anonymousId),
    getStatus: () => ipcRenderer.invoke('memory:getStatus'),
    disconnect: () => ipcRenderer.invoke('memory:disconnect'),
    // Embeddings
    setOpenaiKey: (apiKey: string) => ipcRenderer.invoke('memory:setOpenaiKey', apiKey),
    isEmbeddingsEnabled: () => ipcRenderer.invoke('memory:isEmbeddingsEnabled'),
    // Profile
    getProfile: () => ipcRenderer.invoke('memory:getProfile'),
    updateProfile: (updates: MemoryProfileUpdate) =>
      ipcRenderer.invoke('memory:updateProfile', updates),
    getFacts: (category?: string) => ipcRenderer.invoke('memory:getFacts', category),
    addFact: (fact: MemoryFactInput) => ipcRenderer.invoke('memory:addFact', fact),
    addFacts: (facts: MemoryFactInput[]) => ipcRenderer.invoke('memory:addFacts', facts),
    deleteFact: (factId: string) => ipcRenderer.invoke('memory:deleteFact', factId),
    searchFacts: (query: string, limit?: number) =>
      ipcRenderer.invoke('memory:searchFacts', query, limit),
    getPreferences: (domain?: string) => ipcRenderer.invoke('memory:getPreferences', domain),
    upsertPreference: (pref: MemoryPreferenceInput) =>
      ipcRenderer.invoke('memory:upsertPreference', pref),
    deletePreference: (prefId: string) => ipcRenderer.invoke('memory:deletePreference', prefId),
    getSummaries: (workspacePath?: string) =>
      ipcRenderer.invoke('memory:getSummaries', workspacePath),
    addSummary: (summary: MemorySummaryInput) =>
      ipcRenderer.invoke('memory:addSummary', summary),
    searchSummaries: (query: string, limit?: number) =>
      ipcRenderer.invoke('memory:searchSummaries', query, limit),
    getRelevantMemories: (query: string) =>
      ipcRenderer.invoke('memory:getRelevantMemories', query),
  },
})

// Type definitions for the exposed API
declare global {
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

  // Main API Interface
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      fs: {
        readDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>
        readFile: (filePath: string) => Promise<string | null>
        readFileBase64: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
        writeFile: (filePath: string, content: string) => Promise<boolean>
        selectFolder: () => Promise<string | null>
        createDir: (dirPath: string) => Promise<boolean>
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
      }
      bash: {
        execute: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
      }
      shell: {
        openExternal: (url: string) => Promise<boolean>
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
        // Custom integration methods
        getCustomIntegrations: () => Promise<MCPIntegration[]>
        registerCustomIntegration: (integration: MCPIntegration) => Promise<{ success: boolean; error?: string }>
        unregisterCustomIntegration: (integrationId: string) => Promise<{ success: boolean; error?: string }>
        updateCustomIntegration: (id: string, updates: Partial<MCPIntegration>) => Promise<{ success: boolean; error?: string }>
        loadCustomIntegrations: (integrations: MCPIntegration[]) => Promise<{ success: boolean }>
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
        // Embeddings
        setOpenaiKey: (apiKey: string) => Promise<{ success: boolean; embeddingsEnabled: boolean }>
        isEmbeddingsEnabled: () => Promise<boolean>
        // Profile & Facts
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
    }
  }
}
