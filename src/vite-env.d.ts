/// <reference types="vite/client" />

// Vite worker import declarations
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}
