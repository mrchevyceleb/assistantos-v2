import { useEffect, useRef } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { TitleBar } from './components/layout/TitleBar'
import { WebBrowser } from './components/browser/WebBrowser'
import { useAppStore } from './stores/appStore'

function App() {
  const integrationConfigs = useAppStore((state) => state.integrationConfigs)
  const customIntegrations = useAppStore((state) => state.customIntegrations)
  const customIntegrationsLoaded = useRef(false)

  useEffect(() => {
    // Always use dark mode
    document.documentElement.classList.add('dark')
  }, [])

  // Load custom integrations into the registry on app startup (run once)
  useEffect(() => {
    const loadCustomIntegrations = async () => {
      if (customIntegrationsLoaded.current) return
      customIntegrationsLoaded.current = true

      if (customIntegrations.length > 0 && window.electronAPI?.mcp?.loadCustomIntegrations) {
        try {
          await window.electronAPI.mcp.loadCustomIntegrations(customIntegrations)
          console.log(`[App] Loaded ${customIntegrations.length} custom integrations`)
        } catch (error) {
          console.warn('[App] Failed to load custom integrations:', error)
        }
      }
    }
    loadCustomIntegrations()
  }, [customIntegrations])

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
      <main className="flex-1 w-full flex overflow-hidden">
        <AppLayout />
      </main>
      {/* Legacy WebBrowser modal - kept for backward compatibility */}
      <WebBrowser />
    </div>
  )
}

export default App
