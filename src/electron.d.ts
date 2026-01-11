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
      removeEventListener(event: string, listener: (...args: unknown[]) => void): void
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
  }
}

// JSX IntrinsicElements for webview
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          allowpopups?: string
          partition?: string
          preload?: string
          nodeintegration?: string
          webpreferences?: string
        },
        HTMLElement
      >
    }
  }
}

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
    searchFiles: (workspacePath: string, searchTerm: string) => Promise<Array<{ name: string; path: string; relativePath: string; isDirectory: boolean }>>
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
