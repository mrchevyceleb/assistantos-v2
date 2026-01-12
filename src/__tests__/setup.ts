/**
 * Vitest test setup file
 * Configures the test environment and global mocks
 */

import { vi, beforeAll, afterEach } from 'vitest'

// Mock window.electronAPI for all tests
beforeAll(() => {
  const mockElectronAPI = {
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    fs: {
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(null),
      readFileBase64: vi.fn().mockResolvedValue({ success: false }),
      writeFile: vi.fn().mockResolvedValue(true),
      selectFolder: vi.fn().mockResolvedValue(null),
      createDir: vi.fn().mockResolvedValue(true),
      exists: vi.fn().mockResolvedValue(false),
      searchFiles: vi.fn().mockResolvedValue([]),
      searchContent: vi.fn().mockResolvedValue({ filenameMatches: [], contentMatches: [] }),
      rename: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      copyPath: vi.fn().mockResolvedValue({ success: true }),
      showInExplorer: vi.fn().mockResolvedValue({ success: true }),
      getInfo: vi.fn().mockResolvedValue({ success: false }),
      glob: vi.fn().mockResolvedValue([]),
      grep: vi.fn().mockResolvedValue([]),
      edit: vi.fn().mockResolvedValue({ success: true })
    },
    bash: {
      execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(true),
      openPath: vi.fn().mockResolvedValue({ success: true }),
      showItemInFolder: vi.fn().mockResolvedValue({ success: true })
    },
    workspace: {
      setPath: vi.fn().mockResolvedValue({ success: true })
    },
    mcp: {
      getIntegrations: vi.fn().mockResolvedValue([]),
      getMentionMap: vi.fn().mockResolvedValue({}),
      getAllMentions: vi.fn().mockResolvedValue([]),
      configure: vi.fn().mockResolvedValue({ success: true }),
      start: vi.fn().mockResolvedValue({ success: true }),
      stop: vi.fn().mockResolvedValue({ success: true }),
      isReady: vi.fn().mockResolvedValue(false),
      getTools: vi.fn().mockResolvedValue([]),
      executeTool: vi.fn().mockResolvedValue({ success: false }),
      findIntegrationForTool: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockResolvedValue({}),
      getConfig: vi.fn().mockResolvedValue({}),
      preStartEnabled: vi.fn().mockResolvedValue({ success: true }),
      getCustomIntegrations: vi.fn().mockResolvedValue([]),
      registerCustomIntegration: vi.fn().mockResolvedValue({ success: true }),
      unregisterCustomIntegration: vi.fn().mockResolvedValue({ success: true }),
      updateCustomIntegration: vi.fn().mockResolvedValue({ success: true }),
      loadCustomIntegrations: vi.fn().mockResolvedValue({ success: true })
    },
    conversation: {
      save: vi.fn().mockResolvedValue({ success: true }),
      load: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ success: true }),
      export: vi.fn().mockResolvedValue({ success: true })
    },
    memory: {
      initialize: vi.fn().mockResolvedValue({ success: false }),
      getStatus: vi.fn().mockResolvedValue({
        connected: false,
        factCount: 0,
        preferenceCount: 0,
        summaryCount: 0,
        embeddingsEnabled: false
      }),
      disconnect: vi.fn().mockResolvedValue({ success: true }),
      setOpenaiKey: vi.fn().mockResolvedValue({ success: true, embeddingsEnabled: false }),
      isEmbeddingsEnabled: vi.fn().mockResolvedValue(false),
      getProfile: vi.fn().mockResolvedValue(null),
      updateProfile: vi.fn().mockResolvedValue(null),
      getFacts: vi.fn().mockResolvedValue([]),
      addFact: vi.fn().mockResolvedValue(null),
      addFacts: vi.fn().mockResolvedValue([]),
      deleteFact: vi.fn().mockResolvedValue(false),
      searchFacts: vi.fn().mockResolvedValue([]),
      getPreferences: vi.fn().mockResolvedValue([]),
      upsertPreference: vi.fn().mockResolvedValue(null),
      deletePreference: vi.fn().mockResolvedValue(false),
      getSummaries: vi.fn().mockResolvedValue([]),
      addSummary: vi.fn().mockResolvedValue(null),
      searchSummaries: vi.fn().mockResolvedValue([]),
      getRelevantMemories: vi.fn().mockResolvedValue({
        profile: null,
        facts: [],
        preferences: [],
        summaries: []
      })
    }
  }

  // @ts-ignore - Mocking global window with partial implementation
  globalThis.window = {
    electronAPI: mockElectronAPI,
    location: {
      reload: vi.fn(),
      href: 'http://localhost:5173'
    } as unknown as Location
  }
})

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks()
})
