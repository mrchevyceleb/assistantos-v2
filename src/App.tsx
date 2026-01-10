import { useEffect } from 'react'
import { PanelLayout } from './components/layout/PanelLayout'
import { TitleBar } from './components/layout/TitleBar'
import { useAppStore } from './stores/appStore'

function App() {
  const integrationConfigs = useAppStore((state) => state.integrationConfigs)

  useEffect(() => {
    // Always use dark mode
    document.documentElement.classList.add('dark')
  }, [])

  // Pre-start enabled MCP integrations on app load (Claude Code-like behavior)
  useEffect(() => {
    const preStartMCPServers = async () => {
      const hasEnabled = Object.values(integrationConfigs).some(c => c.enabled)
      if (hasEnabled && window.electronAPI?.mcp?.preStartEnabled) {
        try {
          await window.electronAPI.mcp.preStartEnabled(integrationConfigs)
          console.log('[App] MCP servers pre-started')
        } catch (error) {
          console.warn('[App] Failed to pre-start MCP servers:', error)
        }
      }
    }
    preStartMCPServers()
  }, [integrationConfigs])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <main className="flex-1 flex overflow-hidden">
        <PanelLayout />
      </main>
    </div>
  )
}

export default App
