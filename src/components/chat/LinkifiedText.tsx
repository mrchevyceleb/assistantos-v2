/**
 * LinkifiedText Component
 *
 * Parses text and converts URLs and file paths into clickable links with smart behavior:
 *
 * URLs:
 * - Regular click: Opens in default OS browser
 * - Ctrl+click (Cmd+click on Mac): Opens in the in-app browser tab
 *
 * File Paths:
 * - Regular click: Opens file in default application
 * - Ctrl+click (Cmd+click on Mac): Shows file in file explorer
 * - Right-click: Shows file in file explorer
 *
 * Supports URL patterns:
 * - https://...
 * - http://...
 * - www....
 *
 * Supports file path patterns:
 * - Windows: C:\path\to\file, D:\folder\file.txt
 * - Unix: /path/to/file, /home/user/file.txt
 * - Home: ~/Documents/file.txt, ~/.config/file
 */

import React, { useState, useCallback } from 'react'
import { useLinkHandler } from '../../hooks/useLinkHandler'

// URL regex pattern that matches:
// - Full URLs starting with http:// or https://
// - URLs starting with www. (will be prefixed with https://)
// This pattern is designed to not match trailing punctuation
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"\)]+/gi

// File path regex patterns
// Windows: C:\Users\mtjoh\file.txt, D:\Projects\code\src\index.ts
const WINDOWS_PATH_REGEX = /[A-Za-z]:\\(?:[^<>:"|?*\n\r\s\\]+\\)*[^<>:"|?*\n\r\s\\]+(?:\.[a-zA-Z0-9]+)?/g

// Unix: /home/user/file.txt, /var/log/syslog (but not // or URLs)
const UNIX_PATH_REGEX = /(?<![/:])\/(?!\/)[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+(?:\.[a-zA-Z0-9]+)?/g

// Home: ~/Documents/file.txt, ~/.bashrc
const HOME_PATH_REGEX = /~\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*(?:\.[a-zA-Z0-9]+)?/g

interface LinkifiedTextProps {
  text: string
  className?: string
  linkClassName?: string
  filePathClassName?: string
}

interface TextPart {
  type: 'text' | 'url' | 'filepath'
  content: string
  href?: string
  pathType?: 'windows' | 'unix' | 'home'
}

interface MatchInfo {
  index: number
  length: number
  content: string
  type: 'url' | 'filepath'
  pathType?: 'windows' | 'unix' | 'home'
}

/**
 * Find all matches (URLs and file paths) in text, sorted by position
 */
function findAllMatches(text: string): MatchInfo[] {
  const matches: MatchInfo[] = []

  // Find URLs
  URL_REGEX.lastIndex = 0
  let match
  while ((match = URL_REGEX.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      content: match[0],
      type: 'url'
    })
  }

  // Find Windows paths
  const windowsRegex = new RegExp(WINDOWS_PATH_REGEX.source, 'g')
  while ((match = windowsRegex.exec(text)) !== null) {
    // Skip if this overlaps with a URL (URLs take precedence)
    const overlapsUrl = matches.some(
      m => m.type === 'url' &&
        ((match!.index >= m.index && match!.index < m.index + m.length) ||
         (m.index >= match!.index && m.index < match!.index + match![0].length))
    )
    if (!overlapsUrl) {
      matches.push({
        index: match.index,
        length: match[0].length,
        content: match[0],
        type: 'filepath',
        pathType: 'windows'
      })
    }
  }

  // Find Unix paths
  const unixRegex = new RegExp(UNIX_PATH_REGEX.source, 'g')
  while ((match = unixRegex.exec(text)) !== null) {
    // Skip if overlaps with existing matches
    const overlaps = matches.some(
      m => (match!.index >= m.index && match!.index < m.index + m.length) ||
           (m.index >= match!.index && m.index < match!.index + match![0].length)
    )
    if (!overlaps) {
      matches.push({
        index: match.index,
        length: match[0].length,
        content: match[0],
        type: 'filepath',
        pathType: 'unix'
      })
    }
  }

  // Find home paths
  const homeRegex = new RegExp(HOME_PATH_REGEX.source, 'g')
  while ((match = homeRegex.exec(text)) !== null) {
    // Skip if overlaps with existing matches
    const overlaps = matches.some(
      m => (match!.index >= m.index && match!.index < m.index + m.length) ||
           (m.index >= match!.index && m.index < match!.index + match![0].length)
    )
    if (!overlaps) {
      matches.push({
        index: match.index,
        length: match[0].length,
        content: match[0],
        type: 'filepath',
        pathType: 'home'
      })
    }
  }

  // Sort by position
  matches.sort((a, b) => a.index - b.index)

  return matches
}

/**
 * Parse text and split it into text, URL, and file path parts
 */
function parseTextForUrls(text: string): TextPart[] {
  const parts: TextPart[] = []
  const matches = findAllMatches(text)

  if (matches.length === 0) {
    return [{ type: 'text', content: text }]
  }

  let lastIndex = 0

  for (const matchInfo of matches) {
    // Add text before this match
    if (matchInfo.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, matchInfo.index)
      })
    }

    let content = matchInfo.content
    let suffix = ''

    // Clean up trailing punctuation for URLs
    if (matchInfo.type === 'url') {
      const trailingPunctuation = /[.,;:!?)\]]+$/
      const trailingMatch = content.match(trailingPunctuation)
      if (trailingMatch) {
        const punctuation = trailingMatch[0]
        if (punctuation.includes(')') && !content.slice(0, -punctuation.length).includes('(')) {
          suffix = punctuation
          content = content.slice(0, -punctuation.length)
        } else if (!punctuation.includes(')')) {
          suffix = punctuation
          content = content.slice(0, -punctuation.length)
        }
      }

      // Normalize URL - add https:// if it starts with www.
      const href = content.startsWith('www.') ? `https://${content}` : content

      parts.push({
        type: 'url',
        content,
        href
      })
    } else {
      // File path
      parts.push({
        type: 'filepath',
        content,
        pathType: matchInfo.pathType
      })
    }

    // If we trimmed punctuation, add it back as text
    if (suffix) {
      parts.push({
        type: 'text',
        content: suffix
      })
    }

    lastIndex = matchInfo.index + matchInfo.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    })
  }

  return parts
}

/**
 * Clickable file path component
 */
function ClickableFilePath({ path, className }: { path: string; className?: string }) {
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Ctrl+click or Cmd+click shows in folder
    const showInFolder = e.ctrlKey || e.metaKey

    setError(null)

    try {
      if (showInFolder) {
        const result = await window.electronAPI?.shell?.showItemInFolder(path)
        if (result && !result.success) {
          setError(result.error || 'Failed to show in folder')
          setTimeout(() => setError(null), 3000)
        }
      } else {
        const result = await window.electronAPI?.shell?.openPath(path)
        if (result && !result.success) {
          setError(result.error || 'Failed to open path')
          setTimeout(() => setError(null), 3000)
        }
      }
    } catch (err) {
      setError(String(err))
      setTimeout(() => setError(null), 3000)
    }
  }, [path])

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      const result = await window.electronAPI?.shell?.showItemInFolder(path)
      if (result && !result.success) {
        setError(result.error || 'Failed to show in folder')
        setTimeout(() => setError(null), 3000)
      }
    } catch (err) {
      setError(String(err))
      setTimeout(() => setError(null), 3000)
    }
  }, [path])

  return (
    <span
      className={`cursor-pointer relative inline ${className || ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`Click to open, Ctrl+Click to show in folder\n${path}`}
    >
      <span
        className="text-emerald-400 hover:text-emerald-300 transition-colors"
        style={{
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textDecorationColor: 'rgba(52, 211, 153, 0.5)',
          textUnderlineOffset: '2px'
        }}
      >
        {path}
      </span>
      {error && (
        <span
          className="absolute left-0 top-full mt-1 px-2 py-1 text-xs bg-red-500/90 text-white rounded shadow-lg whitespace-nowrap z-50"
          style={{ pointerEvents: 'none' }}
        >
          {error}
        </span>
      )}
    </span>
  )
}

/**
 * Component that renders text with clickable URLs and file paths
 */
export function LinkifiedText({ text, className, linkClassName, filePathClassName }: LinkifiedTextProps) {
  const { handleLinkClick } = useLinkHandler()

  const parts = parseTextForUrls(text)

  // If no URLs or file paths found, just render the text
  if (parts.length === 1 && parts[0].type === 'text') {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <React.Fragment key={index}>{part.content}</React.Fragment>
        }

        if (part.type === 'filepath') {
          return (
            <ClickableFilePath
              key={index}
              path={part.content}
              className={filePathClassName}
            />
          )
        }

        // URL part
        return (
          <a
            key={index}
            href={part.href}
            onClick={(e) => {
              e.preventDefault()
              if (!handleLinkClick(e, part.href!)) {
                // Regular click - open in system browser
                window.electronAPI?.shell?.openExternal(part.href!)
              }
            }}
            className={linkClassName || 'text-cyan-400 hover:text-cyan-300 underline cursor-pointer'}
            title="Click to open in browser, Ctrl+click for built-in browser"
          >
            {part.content}
          </a>
        )
      })}
    </span>
  )
}

/**
 * Hook that returns the URL parsing function for use in custom renderers
 */
export function useUrlParser() {
  const { handleLinkClick } = useLinkHandler()

  const createClickHandler = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (!handleLinkClick(e, href)) {
      window.electronAPI?.shell?.openExternal(href)
    }
  }

  return {
    parseTextForUrls,
    createClickHandler
  }
}

export { parseTextForUrls }
