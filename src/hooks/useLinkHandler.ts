/**
 * Link Handler Hook
 *
 * Handles link clicks with support for built-in browser.
 * - Regular click: Opens in system default browser
 * - Ctrl+click (Cmd+click on Mac): Opens in built-in browser
 */

import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'

export function useLinkHandler() {
  const openBrowser = useAppStore((state) => state.openBrowser)

  /**
   * Handle a link click event
   * Returns true if the event was handled (should prevent default)
   */
  const handleLinkClick = useCallback(
    (e: React.MouseEvent | MouseEvent, url: string): boolean => {
      // Ctrl+click (or Cmd+click on Mac) opens in built-in browser
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        openBrowser(url)
        return true
      }

      // Regular click - let default behavior handle it (opens in system browser)
      return false
    },
    [openBrowser]
  )

  /**
   * Create click handler props for a link element
   */
  const getLinkProps = useCallback(
    (url: string) => ({
      onClick: (e: React.MouseEvent) => {
        if (handleLinkClick(e, url)) {
          return
        }
        // Default: open in system browser
        e.preventDefault()
        window.electronAPI?.shell?.openExternal(url)
      },
      title: 'Click to open in browser, Ctrl+click for built-in browser',
    }),
    [handleLinkClick]
  )

  /**
   * Open a URL directly in the built-in browser
   */
  const openInBuiltInBrowser = useCallback(
    (url: string) => {
      openBrowser(url)
    },
    [openBrowser]
  )

  /**
   * Open a local file in the built-in browser
   */
  const openLocalFile = useCallback(
    (filePath: string) => {
      // Convert to file:// URL
      const fileUrl = filePath.startsWith('file://') ? filePath : `file://${filePath}`
      openBrowser(fileUrl)
    },
    [openBrowser]
  )

  return {
    handleLinkClick,
    getLinkProps,
    openInBuiltInBrowser,
    openLocalFile,
  }
}

/**
 * Create a delegated click handler for a container
 * This handles clicks on any <a> elements within the container
 */
export function createDelegatedLinkHandler(openBrowser: (url: string) => void) {
  return (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const link = target.closest('a')

    if (!link) return

    const href = link.getAttribute('href')
    if (!href) return

    // Skip internal anchors
    if (href.startsWith('#')) return

    // Ctrl+click opens in built-in browser
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      openBrowser(href)
      return
    }

    // Regular click - open in system browser (only for external URLs)
    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      window.electronAPI?.shell?.openExternal(href)
    }
  }
}
