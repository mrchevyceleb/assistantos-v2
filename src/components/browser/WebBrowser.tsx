/**
 * Built-in Web Browser Component
 *
 * A modal-based web browser that can load local HTML files and external URLs.
 * - Ctrl+click on links opens them here instead of the system browser
 * - Has an address bar for direct URL entry
 * - Supports navigation (back, forward, refresh)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { X, ArrowLeft, ArrowRight, RotateCw, Home, ExternalLink, Globe } from 'lucide-react'

export function WebBrowser() {
  const { browserOpen, browserUrl, closeBrowser, setBrowserUrl } = useAppStore()
  const [addressBarValue, setAddressBarValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [pageTitle, setPageTitle] = useState('')
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  // Sync address bar with browser URL
  useEffect(() => {
    if (browserUrl) {
      setAddressBarValue(browserUrl)
    }
  }, [browserUrl])

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
      setBrowserUrl(e.url)
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
  }, [browserOpen, setBrowserUrl])

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

    setBrowserUrl(finalUrl)
    setAddressBarValue(finalUrl)
  }, [setBrowserUrl])

  const handleAddressBarSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigateTo(addressBarValue)
  }

  const handleGoBack = () => webviewRef.current?.goBack()
  const handleGoForward = () => webviewRef.current?.goForward()
  const handleRefresh = () => webviewRef.current?.reload()
  const handleHome = () => navigateTo('https://www.google.com')

  const handleOpenExternal = () => {
    if (browserUrl) {
      window.electronAPI?.shell?.openExternal(browserUrl)
    }
  }

  if (!browserOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[90vw] h-[85vh] bg-metallic-900 rounded-xl shadow-2xl border border-metallic-700 flex flex-col overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-metallic-800 border-b border-metallic-700">
          <div className="flex items-center gap-2 text-metallic-300">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium truncate max-w-[300px]">
              {pageTitle || 'Web Browser'}
            </span>
          </div>
          <button
            onClick={closeBrowser}
            className="p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-metallic-850 border-b border-metallic-700">
          {/* Nav Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleGoBack}
              disabled={!canGoBack}
              className="p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleGoForward}
              disabled={!canGoForward}
              className="p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Forward"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefresh}
              className={`p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleHome}
              className="p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors"
              title="Home"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Address Bar */}
          <form onSubmit={handleAddressBarSubmit} className="flex-1">
            <input
              type="text"
              value={addressBarValue}
              onChange={(e) => setAddressBarValue(e.target.value)}
              placeholder="Enter URL or search..."
              className="w-full px-3 py-1.5 text-sm bg-metallic-900 border border-metallic-600 rounded-md text-white placeholder-metallic-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </form>

          {/* Open in External Browser */}
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded-md hover:bg-metallic-700 text-metallic-400 hover:text-white transition-colors"
            title="Open in system browser"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="h-0.5 bg-metallic-700">
            <div className="h-full bg-cyan-500 animate-pulse" style={{ width: '30%' }} />
          </div>
        )}

        {/* Webview Container */}
        <div className="flex-1 bg-white">
          {browserUrl && (
            <webview
              ref={webviewRef as React.RefObject<Electron.WebviewTag>}
              src={browserUrl}
              className="w-full h-full"
              allowpopups="true"
            />
          )}
        </div>
      </div>
    </div>
  )
}
