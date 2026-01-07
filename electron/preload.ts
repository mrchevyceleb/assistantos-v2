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
    }
  }
}
