// Type declarations for Electron API exposed via preload script
export interface ElectronAPI {
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
