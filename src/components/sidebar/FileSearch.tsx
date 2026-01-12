import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Search, X, FileText, Folder, Loader2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useTabStore } from '../../stores/tabStore'

interface FilenameMatch {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
}

interface ContentMatch {
  filePath: string
  relativePath: string
  fileName: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

interface SearchResults {
  filenameMatches: FilenameMatch[]
  contentMatches: ContentMatch[]
}

export interface FileSearchHandle {
  focus: () => void
}

interface FileSearchProps {
  onClose?: () => void
}

export const FileSearch = forwardRef<FileSearchHandle, FileSearchProps>(function FileSearch(
  { onClose },
  ref
) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>({ filenameMatches: [], contentMatches: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showResults, setShowResults] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const workspacePath = useAppStore(state => state.workspacePath)
  const openOrFocusFile = useTabStore(state => state.openOrFocusFile)

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }))

  // Calculate total results for navigation
  const totalResults = results.filenameMatches.length + results.contentMatches.length

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!workspacePath || searchQuery.length < 2) {
      setResults({ filenameMatches: [], contentMatches: [] })
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const searchResults = await window.electronAPI.fs.searchContent(workspacePath, searchQuery)
      setResults(searchResults)
      setSelectedIndex(0)
    } catch (error) {
      console.error('Search error:', error)
      setResults({ filenameMatches: [], contentMatches: [] })
    } finally {
      setIsLoading(false)
    }
  }, [workspacePath])

  // Handle query changes with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length >= 2) {
      setShowResults(true)
      debounceRef.current = setTimeout(() => {
        performSearch(query)
      }, 300)
    } else {
      setResults({ filenameMatches: [], contentMatches: [] })
      setShowResults(query.length > 0)
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, performSearch])

  // Handle result selection
  const selectResult = useCallback((index: number) => {
    const filenameCount = results.filenameMatches.length

    if (index < filenameCount) {
      // Filename match
      const match = results.filenameMatches[index]
      if (!match.isDirectory) {
        openOrFocusFile(match.path)
      }
    } else {
      // Content match
      const contentIndex = index - filenameCount
      const match = results.contentMatches[contentIndex]
      openOrFocusFile(match.filePath)
      // TODO: Jump to line number in editor
    }

    setQuery('')
    setShowResults(false)
    onClose?.()
  }, [results, openOrFocusFile, onClose])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, totalResults - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (totalResults > 0) {
          selectResult(selectedIndex)
        }
        break
      case 'Escape':
        e.preventDefault()
        setQuery('')
        setShowResults(false)
        onClose?.()
        break
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.querySelector('[data-selected="true"]')
      selectedElement?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Highlight matching text in content
  const highlightMatch = (text: string, matchStart: number, matchEnd: number) => {
    const before = text.slice(0, matchStart)
    const match = text.slice(matchStart, matchEnd)
    const after = text.slice(matchEnd)

    return (
      <>
        <span className="text-slate-400">{before}</span>
        <span className="text-cyan-400 bg-cyan-500/20 rounded px-0.5">{match}</span>
        <span className="text-slate-400">{after}</span>
      </>
    )
  }

  // Get file extension for icon color
  const getFileIconColor = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'text-blue-400'
      case 'js':
      case 'jsx':
        return 'text-yellow-400'
      case 'py':
        return 'text-green-400'
      case 'json':
        return 'text-amber-400'
      case 'md':
        return 'text-slate-300'
      case 'css':
      case 'scss':
        return 'text-pink-400'
      case 'html':
        return 'text-orange-400'
      default:
        return 'text-slate-400'
    }
  }

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length > 0 && setShowResults(true)}
          placeholder="Search files..."
          className="
            w-full pl-8 pr-8 py-1.5 rounded-lg text-sm
            bg-black/30 border border-white/10
            text-white placeholder-slate-500
            focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20
            transition-all
          "
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setShowResults(false)
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-400 animate-spin" />
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && query.length >= 2 && (
        <div
          ref={resultsRef}
          className="
            absolute top-full left-0 right-0 mt-1 z-50
            max-h-80 overflow-y-auto
            bg-slate-900/95 border border-white/10 rounded-lg
            shadow-xl shadow-black/40
            backdrop-blur-sm
          "
        >
          {totalResults === 0 && !isLoading && (
            <div className="px-3 py-4 text-center text-sm text-slate-500">
              No results found for "{query}"
            </div>
          )}

          {/* Filename Matches */}
          {results.filenameMatches.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider bg-black/20">
                Files
              </div>
              {results.filenameMatches.map((match, index) => (
                <button
                  key={`file-${match.path}`}
                  data-selected={selectedIndex === index}
                  onClick={() => selectResult(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left
                    transition-colors
                    ${selectedIndex === index ? 'bg-cyan-500/20' : 'hover:bg-white/5'}
                  `}
                >
                  {match.isDirectory ? (
                    <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  ) : (
                    <FileText className={`w-4 h-4 flex-shrink-0 ${getFileIconColor(match.name)}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{match.name}</div>
                    <div className="text-xs text-slate-500 truncate">{match.relativePath}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Content Matches */}
          {results.contentMatches.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider bg-black/20">
                Content
              </div>
              {results.contentMatches.map((match, index) => {
                const globalIndex = results.filenameMatches.length + index
                return (
                  <button
                    key={`content-${match.filePath}-${match.lineNumber}`}
                    data-selected={selectedIndex === globalIndex}
                    onClick={() => selectResult(globalIndex)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`
                      w-full flex flex-col gap-0.5 px-3 py-2 text-left
                      transition-colors
                      ${selectedIndex === globalIndex ? 'bg-cyan-500/20' : 'hover:bg-white/5'}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${getFileIconColor(match.fileName)}`} />
                      <span className="text-sm text-white truncate">{match.fileName}</span>
                      <span className="text-xs text-slate-600">:{match.lineNumber}</span>
                    </div>
                    <div className="pl-5.5 text-xs font-mono truncate overflow-hidden">
                      {(() => {
                        // Adjust match positions for trimmed content
                        const originalContent = match.lineContent
                        const trimmedContent = originalContent.trim()
                        const leadingSpaces = originalContent.length - originalContent.trimStart().length
                        const adjustedStart = Math.max(0, match.matchStart - leadingSpaces)
                        const adjustedEnd = Math.max(0, match.matchEnd - leadingSpaces)
                        return highlightMatch(trimmedContent, adjustedStart, adjustedEnd)
                      })()}
                    </div>
                    <div className="pl-5.5 text-xs text-slate-600 truncate">
                      {match.relativePath}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Keyboard hints */}
          {totalResults > 0 && (
            <div className="px-3 py-1.5 border-t border-white/5 flex items-center gap-3 text-xs text-slate-600">
              <span><kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400">Enter</kbd> to open</span>
              <span><kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400">Esc</kbd> to close</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
