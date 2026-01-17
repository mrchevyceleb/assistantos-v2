import { useEffect, useRef, useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { TitleBar } from './components/layout/TitleBar'
import { WebBrowser } from './components/browser/WebBrowser'
import { WelcomeModal } from './components/welcome/WelcomeModal'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { useAppStore } from './stores/appStore'
import { useNotificationStore } from './stores/notificationStore'

function App() {
  const integrationConfigs = useAppStore((state) => state.integrationConfigs)
  const customIntegrations = useAppStore((state) => state.customIntegrations)
  const gmailAccounts = useAppStore((state) => state.gmailAccounts)
  const customIntegrationsLoaded = useRef(false)
  const gmailAccountsInitialized = useRef(false)
  const addNotification = useNotificationStore((state) => state.addNotification)
  const welcomeShown = useRef(false)
  const [gmailInitComplete, setGmailInitComplete] = useState(false)

  useEffect(() => {
    // Always use dark mode
    document.documentElement.classList.add('dark')

    // Show welcome notification on first load (once per session)
    if (!welcomeShown.current) {
      welcomeShown.current = true
      setTimeout(() => {
        addNotification(
          'Welcome to AssistantOS',
          'Notifications are now enabled! You\'ll receive updates when agents complete tasks or encounter errors.',
          'info'
        )
      }, 1000)
    }
  }, [])

  // Load custom integrations into the registry on app startup (run once)
  useEffect(() => {
    const loadCustomIntegrations = async () => {
      if (customIntegrationsLoaded.current) return
      customIntegrationsLoaded.current = true

      if (customIntegrations.length > 0 && window.electronAPI?.mcp?.loadCustomIntegrations) {
        try {
          await window.electronAPI.mcp.loadCustomIntegrations(customIntegrations)
        } catch (error) {
          console.warn('[App] Failed to load custom integrations:', error)
        }
      }
    }
    loadCustomIntegrations()
  }, [customIntegrations])

  // Initialize Gmail accounts on app startup (run once)
  useEffect(() => {
    const initializeGmailAccounts = async () => {
      if (gmailAccountsInitialized.current) return
      gmailAccountsInitialized.current = true

      if (gmailAccounts.length === 0) {
        setGmailInitComplete(true) // No Gmail accounts, mark as complete
        return
      }

      for (const account of gmailAccounts) {
        try {
          // CRITICAL: Re-register virtual integration FIRST (before writing credentials)
          // Virtual integrations exist in frontend appStore but need to be re-registered with backend
          if (window.electronAPI?.mcp?.registerVirtualGmailAccount) {
            await window.electronAPI.mcp.registerVirtualGmailAccount(
              account.id,
              account.label,
              account.email
            )
          }

          // Write credential files for this account
          // CRITICAL FIX: Each Gmail account needs credential files written on app startup
          if (account.tokens.accessToken && window.electronAPI?.mcp?.initializeGmailAccountCredentials) {
            const result = await window.electronAPI.mcp.initializeGmailAccountCredentials(
              account.id,
              account.tokens
            )

            if (result.success && result.envVars) {
              // Merge credential file paths with token env vars
              await window.electronAPI.mcp.configure(account.integrationId, {
                ...result.envVars, // GMAIL_OAUTH_PATH and GMAIL_CREDENTIALS_PATH
                GOOGLE_ACCESS_TOKEN: account.tokens.accessToken,
                GOOGLE_REFRESH_TOKEN: account.tokens.refreshToken,
                GOOGLE_TOKEN_EXPIRES_AT: account.tokens.expiresAt.toString()
              })
            }
          }
        } catch (error) {
          console.warn(`[App] Failed to initialize Gmail account ${account.label}:`, error)
        }
      }

      // Mark initialization as complete
      setGmailInitComplete(true)
    }
    initializeGmailAccounts()
  }, [gmailAccounts])

  // Pre-start enabled MCP integrations on app load (Claude Code-like behavior)
  // MUST wait for Gmail initialization to complete first
  useEffect(() => {
    // Don't run until Gmail accounts are initialized
    if (!gmailInitComplete) return

    const preStartMCPServers = async () => {
      // Merge base integrationConfigs with Gmail accounts
      const mergedConfigs = { ...integrationConfigs }
      for (const account of gmailAccounts) {
        if (account.enabled) {
          // Get credential file paths from backend (already written by initialization effect)
          let credentialEnvVars = {}
          try {
            const envVars = await window.electronAPI.mcp.getConfig(account.integrationId)
            credentialEnvVars = {
              GMAIL_OAUTH_PATH: envVars.GMAIL_OAUTH_PATH,
              GMAIL_CREDENTIALS_PATH: envVars.GMAIL_CREDENTIALS_PATH
            }
          } catch (error) {
            console.warn(`[App] Failed to get credential paths for ${account.integrationId}:`, error)
          }

          mergedConfigs[account.integrationId] = {
            enabled: true,
            envVars: {
              ...credentialEnvVars, // GMAIL_OAUTH_PATH and GMAIL_CREDENTIALS_PATH
              GOOGLE_ACCESS_TOKEN: account.tokens.accessToken,
              GOOGLE_REFRESH_TOKEN: account.tokens.refreshToken,
              GOOGLE_TOKEN_EXPIRES_AT: account.tokens.expiresAt.toString()
            }
          }
        }
      }

      const hasEnabled = Object.values(mergedConfigs).some(c => c.enabled)
      if (hasEnabled && window.electronAPI?.mcp?.preStartEnabled) {
        try {
          await window.electronAPI.mcp.preStartEnabled(mergedConfigs)
        } catch (error) {
          console.warn('[App] Failed to pre-start MCP servers:', error)
        }
      }
    }
    preStartMCPServers()
  }, [integrationConfigs, gmailAccounts, gmailInitComplete])

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col overflow-hidden">
        <TitleBar />
        <main className="flex-1 w-full flex overflow-hidden">
          <ErrorBoundary>
            <AppLayout />
          </ErrorBoundary>
        </main>
        {/* Legacy WebBrowser modal - kept for backward compatibility */}
        <WebBrowser />
        {/* First-launch welcome modal */}
        <WelcomeModal />
      </div>
    </ErrorBoundary>
  )
}

export default App
