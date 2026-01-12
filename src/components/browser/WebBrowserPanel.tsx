/**
 * Web Browser Panel Component
 *
 * Non-modal version of the web browser for use in the tab system.
 * - Renders as a panel in the tab content area
 * - Has navigation controls and address bar
 * - Supports local files and external URLs
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Home, ExternalLink, Globe } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'

interface WebBrowserPanelProps {
  url?: string
}

export function WebBrowserPanel({ url: initialUrl }: WebBrowserPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(initialUrl || 'https://www.google.com')
  const [addressBarValue, setAddressBarValue] = useState(currentUrl)
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [pageTitle, setPageTitle] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const updateTab = useTabStore(state => state.updateTab)
  const activeTab = useTabStore(state => state.getActiveTab())

  // Update tab title when page title changes
  useEffect(() => {
    if (pageTitle && activeTab?.type === 'browser') {
      updateTab(activeTab.id, { title: pageTitle || 'Browser' })
    }
  }, [pageTitle, activeTab?.id, updateTab])

  // Track if webview is ready
  const [webviewReady, setWebviewReady] = useState(false)
  const pendingUrlRef = useRef<string | null>(null)

  // Setup webview event listeners
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDomReady = () => {
      setWebviewReady(true)
      // Load any pending URL
      if (pendingUrlRef.current) {
        webview.loadURL(pendingUrlRef.current)
        pendingUrlRef.current = null
      }
    }
    const handleStartLoading = () => {
      setIsLoading(true)
      setErrorMessage(null)
    }
    const handleStopLoading = () => {
      setIsLoading(false)
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    }
    const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      // Ignore -3 (ERR_ABORTED) which happens during redirects
      if (e.errorCode === -3) return
      // Only show errors for main frame failures, not subresources
      if (!e.isMainFrame) {
        console.warn('[WebBrowser] Subresource failed:', e.errorDescription, e.validatedURL)
        return
      }
      setIsLoading(false)
      setErrorMessage(`Failed to load: ${e.errorDescription} (${e.errorCode})`)
    }
    const handleNavigate = (e: Electron.DidNavigateEvent) => {
      setAddressBarValue(e.url)
      setCurrentUrl(e.url)

      // Update tab URL
      if (activeTab?.type === 'browser') {
        updateTab(activeTab.id, { url: e.url })
      }
    }
    const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      setPageTitle(e.title)
    }
    const handleNewWindow = (e: Electron.NewWindowWebContentsEvent) => {
      // Open new windows in the same webview
      e.preventDefault()
      if (webview) {
        webview.loadURL(e.url)
      }
    }

    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-fail-load', handleDidFailLoad)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('page-title-updated', handleTitleUpdate)
    webview.addEventListener('new-window', handleNewWindow)

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-fail-load', handleDidFailLoad)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('page-title-updated', handleTitleUpdate)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [activeTab?.id, updateTab])

  // Load initial URL when webview becomes ready
  useEffect(() => {
    if (webviewReady && currentUrl && currentUrl !== 'about:blank') {
      const webview = webviewRef.current
      if (webview) {
        webview.loadURL(currentUrl)
      }
    }
  }, [webviewReady]) // Only run when webviewReady changes

  const navigateTo = useCallback((url: string) => {
    if (!url.trim()) return

    let finalUrl = url.trim()

    // Handle local file paths
    if (finalUrl.startsWith('/') || finalUrl.match(/^[A-Za-z]:\\/)) {
      finalUrl = `file://${finalUrl}`
    }
    // Add protocol if missing
    else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('file://')) {
      // If it looks like a URL (has dot), add https
      if (finalUrl.includes('.')) {
        finalUrl = `https://${finalUrl}`
      } else {
        // Otherwise treat as search (Google)
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
      }
    }

    setCurrentUrl(finalUrl)
    setAddressBarValue(finalUrl)

    // Load URL via webview API if ready, otherwise queue it
    const webview = webviewRef.current
    if (webview && webviewReady) {
      webview.loadURL(finalUrl)
    } else {
      pendingUrlRef.current = finalUrl
    }
  }, [webviewReady])

  const handleAddressBarSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigateTo(addressBarValue)
  }

  const handleGoBack = () => webviewRef.current?.goBack()
  const handleGoForward = () => webviewRef.current?.goForward()
  const handleRefresh = () => webviewRef.current?.reload()
  const handleHome = () => navigateTo('https://www.google.com')

  const handleOpenExternal = () => {
    if (currentUrl) {
      window.electronAPI?.shell?.openExternal(currentUrl)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-slate-900">
      {/* Navigation Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-white/5">
        {/* Nav Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleGoBack}
            disabled={!canGoBack}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleGoForward}
            disabled={!canGoForward}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleHome}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Home"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Address Bar */}
        <form onSubmit={handleAddressBarSubmit} className="flex-1">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg focus-within:border-cyan-500/50">
            <Globe className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={addressBarValue}
              onChange={(e) => setAddressBarValue(e.target.value)}
              placeholder="Enter URL or search..."
              className="flex-1 text-sm bg-transparent text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </form>

        {/* Open in External Browser */}
        <button
          onClick={handleOpenExternal}
          className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title="Open in system browser"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="h-0.5 bg-slate-700">
          <div className="h-full bg-cyan-500 animate-pulse" style={{ width: '30%' }} />
        </div>
      )}

      {/* Webview Container */}
      <div className="flex-1 bg-white relative">
        <webview
          ref={webviewRef as React.RefObject<Electron.WebviewTag>}
          src="about:blank"
          className="w-full h-full"
          allowpopups={true}
          partition="persist:browser"
          webpreferences="nodeIntegration=no,contextIsolation=yes"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        />
        {errorMessage && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="text-center p-8 max-w-md">
              <p className="text-red-600 font-medium mb-4">{errorMessage}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-cyan-500 text-white rounded-md hover:bg-cyan-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
