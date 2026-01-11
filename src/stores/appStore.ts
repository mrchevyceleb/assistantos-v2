import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TaskSettings, DEFAULT_TASK_SETTINGS, KanbanSettings, DEFAULT_KANBAN_SETTINGS, CenterPanelView } from '@/types/task'

// MCP Integration type (matching electron/mcp/registry.ts)
export interface MCPIntegration {
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

// Available Claude models
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', tier: 'opus' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'sonnet' },
  { id: 'claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', tier: 'haiku' },
] as const

export type ModelId = typeof AVAILABLE_MODELS[number]['id']

export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4-20250514'

// Default custom instructions for new users
// Integration configuration
export interface IntegrationConfig {
  enabled: boolean
  envVars: Record<string, string>
  oauthTokens?: {
    accessToken: string
    refreshToken: string
    expiresAt?: number
  }
}

export const DEFAULT_CUSTOM_INSTRUCTIONS = `## My Preferences

### Communication Style
- Be direct and concise
- Explain your reasoning for important decisions
- Ask clarifying questions when needed

### When Writing
- Match my voice and tone
- Prioritize clarity over formality

### When Coding
- Use TypeScript with strict typing
- Follow existing patterns in the codebase
- Comment complex logic

### General
- Be proactive - take action rather than just explaining
- Consider the bigger picture, not just the immediate task`

interface AppState {
  // Workspace
  workspacePath: string | null
  setWorkspacePath: (path: string | null) => void

  // Files
  currentFile: string | null
  openFiles: string[]
  openFile: (path: string) => void
  closeFile: () => void
  closeFileByPath: (path: string) => void

  // API Keys
  apiKey: string
  setApiKey: (key: string) => void

  // Model Selection
  selectedModel: ModelId
  setSelectedModel: (model: ModelId) => void

  // Max Tokens
  maxTokens: number
  setMaxTokens: (tokens: number) => void

  // UI State
  sidebarCollapsed: boolean
  chatCollapsed: boolean
  toggleSidebar: () => void
  toggleChat: () => void

  // Custom Instructions
  customInstructions: string
  setCustomInstructions: (instructions: string) => void
  resetCustomInstructions: () => void

  // MCP Integrations
  integrationConfigs: Record<string, IntegrationConfig>
  setIntegrationConfig: (integrationId: string, config: IntegrationConfig) => void
  updateIntegrationEnvVars: (integrationId: string, envVars: Record<string, string>) => void
  setIntegrationEnabled: (integrationId: string, enabled: boolean) => void
  setIntegrationOAuthTokens: (integrationId: string, tokens: IntegrationConfig['oauthTokens']) => void

  // Custom MCP Integrations (user-defined)
  customIntegrations: MCPIntegration[]
  addCustomIntegration: (integration: MCPIntegration) => void
  removeCustomIntegration: (id: string) => void
  updateCustomIntegration: (id: string, updates: Partial<MCPIntegration>) => void

  // Center Panel View Mode
  centerPanelView: CenterPanelView
  setCenterPanelView: (view: CenterPanelView) => void

  // Starred Documents
  starredPaths: string[]
  toggleStarred: (path: string) => void
  isStarred: (path: string) => boolean

  // Task Settings (legacy)
  taskSettings: TaskSettings
  setTaskSettings: (settings: Partial<TaskSettings>) => void

  // Kanban Settings (new)
  kanbanSettings: KanbanSettings
  setKanbanSettings: (settings: Partial<KanbanSettings>) => void

  // Workspace Onboarding
  onboardedWorkspaces: string[]
  markWorkspaceOnboarded: (path: string) => void
  isWorkspaceOnboarded: (path: string) => boolean


  // Memory Settings
  memoryEnabled: boolean
  memorySupabaseUrl: string
  memorySupabaseAnonKey: string
  memoryUserId: string | null
  memoryOpenaiKey: string
  setMemoryEnabled: (enabled: boolean) => void
  setMemorySupabaseUrl: (url: string) => void
  setMemorySupabaseAnonKey: (key: string) => void
  setMemoryUserId: (id: string | null) => void
  setMemoryOpenaiKey: (key: string) => void
  generateMemoryUserId: () => string

  // Pending Chat Prompt (for programmatic injection - auto-sends)
  pendingChatPrompt: string | null
  setPendingChatPrompt: (prompt: string | null) => void

  // Pending Chat Input (for populating input without sending)
  pendingChatInput: string | null
  setPendingChatInput: (input: string | null) => void

  // Editor Settings
  editorFontSize: number
  setEditorFontSize: (size: number) => void
  increaseEditorFontSize: () => void
  decreaseEditorFontSize: () => void

  // Built-in Browser
  browserOpen: boolean
  browserUrl: string | null
  openBrowser: (url: string) => void
  closeBrowser: () => void
  setBrowserUrl: (url: string) => void

  // Hydration flag (for avoiding race conditions with persisted settings)
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Workspace
      workspacePath: null,
      setWorkspacePath: (path) => set({ workspacePath: path }),

      // Files
      currentFile: null,
      openFiles: [],
      openFile: (path) => {
        const { openFiles } = get()
        if (!openFiles.includes(path)) {
          set({ openFiles: [...openFiles, path] })
        }
        set({ currentFile: path })
      },
      closeFile: () => {
        const { currentFile, openFiles } = get()
        if (!currentFile) return
        const newOpenFiles = openFiles.filter(f => f !== currentFile)
        set({
          openFiles: newOpenFiles,
          currentFile: newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null,
        })
      },
      closeFileByPath: (path) => {
        const { currentFile, openFiles } = get()
        const newOpenFiles = openFiles.filter(f => f !== path)
        set({
          openFiles: newOpenFiles,
          currentFile: currentFile === path
            ? (newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null)
            : currentFile,
        })
      },

      // API Keys
      apiKey: '',
      setApiKey: (key) => set({ apiKey: key }),

      // Model Selection
      selectedModel: DEFAULT_MODEL,
      setSelectedModel: (model) => set({ selectedModel: model }),

      // Max Tokens
      maxTokens: 8192,
      setMaxTokens: (tokens) => set({ maxTokens: tokens }),

      // UI State
      sidebarCollapsed: false,
      chatCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleChat: () => set((state) => ({ chatCollapsed: !state.chatCollapsed })),

      // Custom Instructions
      customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS,
      setCustomInstructions: (instructions) => set({ customInstructions: instructions }),
      resetCustomInstructions: () => set({ customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS }),

      // MCP Integrations
      integrationConfigs: {},
      setIntegrationConfig: (integrationId, config) => set((state) => ({
        integrationConfigs: {
          ...state.integrationConfigs,
          [integrationId]: config,
        },
      })),
      updateIntegrationEnvVars: (integrationId, envVars) => set((state) => ({
        integrationConfigs: {
          ...state.integrationConfigs,
          [integrationId]: {
            ...state.integrationConfigs[integrationId] || { enabled: false, envVars: {} },
            envVars,
          },
        },
      })),
      setIntegrationEnabled: (integrationId, enabled) => set((state) => ({
        integrationConfigs: {
          ...state.integrationConfigs,
          [integrationId]: {
            ...state.integrationConfigs[integrationId] || { enabled: false, envVars: {} },
            enabled,
          },
        },
      })),
      setIntegrationOAuthTokens: (integrationId, tokens) => set((state) => ({
        integrationConfigs: {
          ...state.integrationConfigs,
          [integrationId]: {
            ...state.integrationConfigs[integrationId] || { enabled: false, envVars: {} },
            oauthTokens: tokens,
          },
        },
      })),

      // Custom MCP Integrations
      customIntegrations: [],
      addCustomIntegration: (integration) => set((state) => ({
        customIntegrations: [...state.customIntegrations, { ...integration, isCustom: true }],
      })),
      removeCustomIntegration: (id) => set((state) => ({
        customIntegrations: state.customIntegrations.filter(int => int.id !== id),
        // Also remove the config
        integrationConfigs: Object.fromEntries(
          Object.entries(state.integrationConfigs).filter(([key]) => key !== id)
        ),
      })),
      updateCustomIntegration: (id, updates) => set((state) => ({
        customIntegrations: state.customIntegrations.map(int =>
          int.id === id ? { ...int, ...updates, id, isCustom: true } : int
        ),
      })),

      // Center Panel View Mode
      centerPanelView: 'editor' as CenterPanelView,
      setCenterPanelView: (view) => set({ centerPanelView: view }),

      // Starred Documents
      starredPaths: [],
      toggleStarred: (path) => set((state) => {
        const isCurrentlyStarred = state.starredPaths.includes(path)
        return {
          starredPaths: isCurrentlyStarred
            ? state.starredPaths.filter(p => p !== path)
            : [...state.starredPaths, path]
        }
      }),
      isStarred: (path) => get().starredPaths.includes(path),

      // Task Settings (legacy)
      taskSettings: DEFAULT_TASK_SETTINGS,
      setTaskSettings: (settings) => set((state) => ({
        taskSettings: { ...state.taskSettings, ...settings }
      })),

      // Kanban Settings
      kanbanSettings: DEFAULT_KANBAN_SETTINGS,
      setKanbanSettings: (settings) => set((state) => ({
        kanbanSettings: { ...state.kanbanSettings, ...settings }
      })),

      // Workspace Onboarding
      onboardedWorkspaces: [],
      markWorkspaceOnboarded: (path) => set((state) => ({
        onboardedWorkspaces: state.onboardedWorkspaces.includes(path)
          ? state.onboardedWorkspaces
          : [...state.onboardedWorkspaces, path]
      })),
      isWorkspaceOnboarded: (path) => get().onboardedWorkspaces.includes(path),


      // Memory Settings
      memoryEnabled: false,
      memorySupabaseUrl: '',
      memorySupabaseAnonKey: '',
      memoryUserId: null,
      memoryOpenaiKey: '',
      setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
      setMemorySupabaseUrl: (url) => set({ memorySupabaseUrl: url }),
      setMemorySupabaseAnonKey: (key) => set({ memorySupabaseAnonKey: key }),
      setMemoryUserId: (id) => set({ memoryUserId: id }),
      setMemoryOpenaiKey: (key) => set({ memoryOpenaiKey: key }),
      generateMemoryUserId: () => {
        const id = crypto.randomUUID()
        set({ memoryUserId: id })
        return id
      },

      // Pending Chat Prompt (auto-sends)
      pendingChatPrompt: null,
      setPendingChatPrompt: (prompt) => set({ pendingChatPrompt: prompt }),

      // Pending Chat Input (just populates input, doesn't send)
      pendingChatInput: null,
      setPendingChatInput: (input) => set({ pendingChatInput: input }),

      // Editor Settings
      editorFontSize: 16, // default 16px (1rem)
      setEditorFontSize: (size) => set({ editorFontSize: Math.min(32, Math.max(12, size)) }),
      increaseEditorFontSize: () => set((state) => ({
        editorFontSize: Math.min(32, state.editorFontSize + 2)
      })),
      decreaseEditorFontSize: () => set((state) => ({
        editorFontSize: Math.max(12, state.editorFontSize - 2)
      })),

      // Built-in Browser
      browserOpen: false,
      browserUrl: null,
      openBrowser: (url) => set({ browserOpen: true, browserUrl: url }),
      closeBrowser: () => set({ browserOpen: false }),
      setBrowserUrl: (url) => set({ browserUrl: url }),

      // Hydration flag
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'assistantos-storage',
      onRehydrateStorage: () => (state) => {
        // Set hydrated flag after persisted state loads
        state?.setHasHydrated(true)
      },
      partialize: (state) => ({
        workspacePath: state.workspacePath,
        apiKey: state.apiKey,
        selectedModel: state.selectedModel,
        maxTokens: state.maxTokens,
        sidebarCollapsed: state.sidebarCollapsed,
        chatCollapsed: state.chatCollapsed,
        customInstructions: state.customInstructions,
        integrationConfigs: state.integrationConfigs,
        customIntegrations: state.customIntegrations,
        centerPanelView: state.centerPanelView,
        starredPaths: state.starredPaths,
        taskSettings: state.taskSettings,
        kanbanSettings: state.kanbanSettings,
        onboardedWorkspaces: state.onboardedWorkspaces,
        memoryEnabled: state.memoryEnabled,
        memorySupabaseUrl: state.memorySupabaseUrl,
        memorySupabaseAnonKey: state.memorySupabaseAnonKey,
        memoryUserId: state.memoryUserId,
        memoryOpenaiKey: state.memoryOpenaiKey,
        editorFontSize: state.editorFontSize,
      }),
    }
  )
)
