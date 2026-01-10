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
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
  },

  // Bash command execution
  bash: {
    execute: (command: string, cwd: string) => ipcRenderer.invoke('bash:execute', command, cwd),
  },

  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
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
  },
})

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      fs: {
        readDir: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>
        readFile: (filePath: string) => Promise<string | null>
        writeFile: (filePath: string, content: string) => Promise<boolean>
        selectFolder: () => Promise<string | null>
        createDir: (dirPath: string) => Promise<boolean>
        exists: (filePath: string) => Promise<boolean>
      }
      bash: {
        execute: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
      }
      shell: {
        openExternal: (url: string) => Promise<boolean>
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
      }
    }
  }

  // MCP Types
  interface MCPIntegration {
    id: string
    name: string
    description: string
    mention: string
    mentionAliases?: string[]
    category: 'browser' | 'google' | 'search' | 'cloud' | 'media'
    requiredEnvVars: Array<{
      key: string
      label: string
      type: 'apiKey' | 'oauth' | 'text'
      description?: string
    }>
    oauth?: {
      provider: 'google'
      scopes: string[]
    }
    toolPrefix: string
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
}
