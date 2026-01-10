import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Default custom instructions for new users
export const DEFAULT_CUSTOM_INSTRUCTIONS = `## My Preferences

### Coding Style
- Use TypeScript with strict typing
- Prefer functional components with hooks
- Use descriptive variable names

### Communication
- Explain changes before making them
- Provide examples when helpful

### Workflow
- Commit frequently with clear messages
- Run tests after significant changes`

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

  // UI State
  sidebarCollapsed: boolean
  chatCollapsed: boolean
  toggleSidebar: () => void
  toggleChat: () => void

  // Theme
  isDarkMode: boolean
  toggleTheme: () => void

  // Custom Instructions
  customInstructions: string
  setCustomInstructions: (instructions: string) => void
  resetCustomInstructions: () => void
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

      // UI State
      sidebarCollapsed: false,
      chatCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleChat: () => set((state) => ({ chatCollapsed: !state.chatCollapsed })),

      // Theme
      isDarkMode: true,
      toggleTheme: () => {
        const newIsDark = !get().isDarkMode
        set({ isDarkMode: newIsDark })
        if (newIsDark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },

      // Custom Instructions
      customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS,
      setCustomInstructions: (instructions) => set({ customInstructions: instructions }),
      resetCustomInstructions: () => set({ customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS }),
    }),
    {
      name: 'assistantos-storage',
      partialize: (state) => ({
        workspacePath: state.workspacePath,
        apiKey: state.apiKey,
        sidebarCollapsed: state.sidebarCollapsed,
        chatCollapsed: state.chatCollapsed,
        isDarkMode: state.isDarkMode,
        customInstructions: state.customInstructions,
      }),
    }
  )
)
