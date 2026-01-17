import React from 'react'
import ReactDOM from 'react-dom/client'
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import App from './App'
import './index.css'

// =============================================================================
// Global Error Handlers (Renderer Process)
// =============================================================================

/**
 * Handle unhandled promise rejections in the renderer process
 * Prevents silent failures and logs errors for debugging
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled Promise Rejection:', event.reason)
  // Prevent the default browser behavior (logging to console twice)
  // event.preventDefault()
})

/**
 * Handle global errors in the renderer process
 */
window.addEventListener('error', (event) => {
  console.error('[Renderer] Global Error:', event.error || event.message)
})

// Configure Monaco environment with proper workers for Electron/Vite
window.MonacoEnvironment = {
  getWorker: function (_workerId: string, _label: string) {
    return new editorWorker()
  }
}

// Use the locally imported monaco instead of loading from CDN
loader.config({ monaco })

// Define custom theme
monaco.editor.defineTheme('assistantos-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7280' },
    { token: 'keyword', foreground: '00f0ff' },
    { token: 'string', foreground: '10b981' },
  ],
  colors: {
    'editor.background': '#0a0a0f',
    'editor.foreground': '#e2e8f0',
    'editor.lineHighlightBackground': '#1e293b',
    'editor.selectionBackground': '#334155',
    'editorCursor.foreground': '#00f0ff',
    'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#94a3b8',
    'editor.inactiveSelectionBackground': '#1e293b',
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
