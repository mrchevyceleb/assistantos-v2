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
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const updateTab = useTabStore(state => state.updateTab)
  const activeTab = useTabStore(state => state.getActiveTab())

  // Update tab title when page title changes
  useEffect(() => {
    if (pageTitle && activeTab?.type === 'browser') {
      updateTab(activeTab.id, { title: pageTitle || 'Browser' })
    }
  }, [pageTitle, activeTab?.id, updateTab])

  // Setup webview event listeners
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoading = () => setIsLoading(true)
    const handleStopLoading = () => {
      setIsLoading(false)
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
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

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('page-title-updated', handleTitleUpdate)
    webview.addEventListener('new-window', handleNewWindow)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('page-title-updated', handleTitleUpdate)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [activeTab?.id, updateTab])

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
  }, [])

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
    <div className="flex flex-col h-full bg-slate-900">
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
      <div className="flex-1 bg-white">
        <webview
          ref={webviewRef as React.RefObject<Electron.WebviewTag>}
          src={currentUrl}
          className="w-full h-full"
          allowpopups="true"
        />
      </div>
    </div>
  )
}
