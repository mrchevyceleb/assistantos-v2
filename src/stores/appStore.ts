import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TaskSettings, DEFAULT_TASK_SETTINGS, CenterPanelView } from '@/types/task'

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

  // Center Panel View Mode
  centerPanelView: CenterPanelView
  setCenterPanelView: (view: CenterPanelView) => void

  // Starred Documents
  starredPaths: string[]
  toggleStarred: (path: string) => void
  isStarred: (path: string) => boolean

  // Task Settings
  taskSettings: TaskSettings
  setTaskSettings: (settings: Partial<TaskSettings>) => void
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

      // Task Settings
      taskSettings: DEFAULT_TASK_SETTINGS,
      setTaskSettings: (settings) => set((state) => ({
        taskSettings: { ...state.taskSettings, ...settings }
      })),
    }),
    {
      name: 'assistantos-storage',
      partialize: (state) => ({
        workspacePath: state.workspacePath,
        apiKey: state.apiKey,
        selectedModel: state.selectedModel,
        maxTokens: state.maxTokens,
        sidebarCollapsed: state.sidebarCollapsed,
        chatCollapsed: state.chatCollapsed,
        customInstructions: state.customInstructions,
        integrationConfigs: state.integrationConfigs,
        centerPanelView: state.centerPanelView,
        starredPaths: state.starredPaths,
        taskSettings: state.taskSettings,
      }),
    }
  )
)
