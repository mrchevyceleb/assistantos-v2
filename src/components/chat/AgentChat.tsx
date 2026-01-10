import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Settings2, Sparkles, Terminal, FileText, ChevronDown, ChevronRight, RotateCcw, Eye, EyeOff, RefreshCw, Puzzle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Store
import { useAppStore, AVAILABLE_MODELS, type ModelId } from '../../stores/appStore'

// Services
import { ClaudeService, type ChatChunk } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt, type EnabledIntegration } from '../../services/systemPrompt'
import { getCachedMCPTools, invalidateToolCache } from '../../services/toolCache'
import { gatherDynamicContext, formatContextForPrompt } from '../../services/contextService'
import {
  parseMessage,
  getUnifiedSuggestions,
  getPartialMention,
  completeMention,
  clearMentionCache,
  type UnifiedSuggestion,
  type DocumentMention
} from '../../services/mentions/parser'

// Components
import { IntegrationsModal } from '../settings/IntegrationsModal'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolResult?: string
}

/**
 * Read and format referenced document content
 */
async function readDocumentContext(documents: DocumentMention[]): Promise<string> {
  const docContents: string[] = []

  for (const doc of documents) {
    try {
      const content = await window.electronAPI.fs.readFile(doc.path)
      if (content) {
        docContents.push(`--- ${doc.relativePath} ---\n${content}\n`)
      }
    } catch (e) {
      console.error(`Failed to read document: ${doc.path}`, e)
    }
  }

  if (docContents.length === 0) return ''
  return `\n\n<referenced_documents>\n${docContents.join('\n')}</referenced_documents>`
}

/**
 * Prepare all enabled MCP tools (Claude Code-like behavior)
 * Tools are loaded based on enabled integrations, not @mentions
 * @param integrationConfigs - Integration configurations from store
 */
async function prepareAllEnabledTools(
  integrationConfigs: Record<string, { enabled: boolean; envVars: Record<string, string> }>
) {
  // Get all enabled integration IDs
  const enabledIds = Object.entries(integrationConfigs)
    .filter(([_, config]) => config.enabled)
    .map(([id]) => id)

  if (enabledIds.length === 0) return allTools

  try {
    // Use cached tools for performance
    const mcpTools = await getCachedMCPTools(enabledIds)
    return [...allTools, ...mcpTools]
  } catch (e) {
    console.error('Failed to load MCP tools:', e)
    return allTools
  }
}

export function AgentChat() {
  const {
    apiKey,
    setApiKey,
    workspacePath,
    openFiles,
    currentFile,
    customInstructions,
    setCustomInstructions,
    resetCustomInstructions,
    selectedModel,
    setSelectedModel,
    integrationConfigs,
  } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showContextPreview, setShowContextPreview] = useState(false)
  const [contextPreview, setContextPreview] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [mentionSuggestions, setMentionSuggestions] = useState<UnifiedSuggestion[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [activeDocuments, setActiveDocuments] = useState<DocumentMention[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize or update Claude service when API key changes
  useEffect(() => {
    if (apiKey) {
      claudeServiceRef.current = new ClaudeService(apiKey, selectedModel)
    } else {
      claudeServiceRef.current = null
    }
  }, [apiKey, selectedModel])

  // Update model when it changes mid-chat
  useEffect(() => {
    if (claudeServiceRef.current) {
      claudeServiceRef.current.setModel(selectedModel)
    }
  }, [selectedModel])

  // Update context preview when toggled or workspace changes
  useEffect(() => {
    if (showContextPreview) {
      gatherDynamicContext(workspacePath, openFiles, currentFile)
        .then((context) => setContextPreview(formatContextForPrompt(context)))
        .catch(() => setContextPreview('Error loading context'))
    }
  }, [showContextPreview, workspacePath, openFiles, currentFile])

  // Handle input change for @mention autocomplete
  const handleInputChange = useCallback(async (value: string) => {
    setInput(value)

    // Check for partial mention at end of input
    const partial = getPartialMention(value)
    if (partial && partial.length > 1) {
      const suggestions = await getUnifiedSuggestions(partial, workspacePath)
      setMentionSuggestions(suggestions.slice(0, 10))
      setSelectedSuggestionIndex(0)
    } else {
      setMentionSuggestions([])
    }

    // Parse and track active mentions (both integrations and documents)
    const parsed = await parseMessage(value, workspacePath)
    setActiveMentions(parsed.mentions)
    setActiveDocuments(parsed.documentMentions)
  }, [workspacePath])

  // Complete a mention from autocomplete
  const handleMentionSelect = useCallback((suggestion: UnifiedSuggestion) => {
    const completed = completeMention(input, suggestion.mention)
    setInput(completed)
    setMentionSuggestions([])
    inputRef.current?.focus()

    // Update active mentions (both integrations and documents)
    parseMessage(completed, workspacePath).then(parsed => {
      setActiveMentions(parsed.mentions)
      setActiveDocuments(parsed.documentMentions)
    })
  }, [input, workspacePath])

  // Clear caches when integrations modal closes (in case configs changed)
  const handleIntegrationsClose = useCallback(() => {
    setShowIntegrations(false)
    clearMentionCache()
    invalidateToolCache() // Refresh tools on next message
  }, [])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    if (!apiKey) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Please configure your Anthropic API key in settings to chat with Claude.',
        timestamp: new Date(),
      }])
      return
    }

    if (!workspacePath) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Please select a workspace folder first using the file tree.',
        timestamp: new Date(),
      }])
      return
    }

    if (!claudeServiceRef.current) {
      claudeServiceRef.current = new ClaudeService(apiKey, selectedModel)
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setMentionSuggestions([])
    setActiveMentions([])
    setActiveDocuments([])
    setIsLoading(true)

    // Create assistant message that will be updated with streaming content
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }])

    try {
      // Read content of referenced documents
      const documentContext = await readDocumentContext(activeDocuments)

      // Get enabled integration IDs for tool loading and capability awareness
      const enabledIds = Object.entries(integrationConfigs)
        .filter(([_, config]) => config.enabled)
        .map(([id]) => id)

      // Fetch integration metadata for capability awareness in system prompt
      let enabledIntegrations: EnabledIntegration[] = []
      if (enabledIds.length > 0) {
        try {
          const allIntegrations = await window.electronAPI.mcp.getIntegrations()
          enabledIntegrations = allIntegrations
            .filter((int: any) => enabledIds.includes(int.id))
            .map((int: any) => ({
              id: int.id,
              name: int.name,
              description: int.description
            }))
        } catch (e) {
          console.error('Failed to fetch integration metadata:', e)
        }
      }

      // Assemble full system prompt with capability awareness
      const fullSystemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions,
        enabledIntegrations
      )

      // Prepare tools (native + all enabled MCP integrations)
      // Claude Code-like behavior: all enabled tools available, no @mention required
      const tools = await prepareAllEnabledTools(integrationConfigs)

      // Append document context to user message if documents were referenced
      const messageWithContext = documentContext
        ? `${input.trim()}${documentContext}`
        : input.trim()

      // Setup tool executor
      const toolExecutor = createToolExecutor(workspacePath)

      const stream = claudeServiceRef.current.chat(
        messageWithContext,
        tools,
        fullSystemPrompt,
        toolExecutor
      )

      for await (const chunk of stream) {
        handleChunk(chunk, assistantMessageId)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => {
        const updated = [...prev]
        const lastIndex = updated.findIndex(m => m.id === assistantMessageId)
        if (lastIndex !== -1) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
          }
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTextChunk = (chunk: ChatChunk, assistantMessageId: string) => {
    setMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.findIndex(m => m.id === assistantMessageId)
      if (lastIndex !== -1) {
        updated[lastIndex] = {
          ...updated[lastIndex],
          content: updated[lastIndex].content + (chunk.text || '')
        }
      }
      return updated
    })
  }

  const handleToolUseChunk = (chunk: ChatChunk) => {
    if (!chunk.toolName || !chunk.toolInput) return

    // Insert tool message BEFORE the assistant message so assistant text stays at bottom
    setMessages(prev => {
      const newToolMessage: Message = {
        id: `tool-${chunk.toolId}`,
        role: 'tool',
        content: `Using ${chunk.toolName}`,
        toolName: chunk.toolName,
        timestamp: new Date(),
      }

      // Find the last assistant message index
      let lastAssistantIndex = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'assistant') {
          lastAssistantIndex = i
          break
        }
      }

      if (lastAssistantIndex !== -1) {
        const updated = [...prev]
        updated.splice(lastAssistantIndex, 0, newToolMessage)
        return updated
      }

      return [...prev, newToolMessage]
    })
  }

  const handleToolResultChunk = (chunk: ChatChunk) => {
    setMessages(prev => {
      const updated = [...prev]
      const toolIndex = updated.findIndex(m => m.id === `tool-${chunk.toolId}`)
      if (toolIndex !== -1) {
        updated[toolIndex] = {
          ...updated[toolIndex],
          toolResult: chunk.result
        }
      }
      return updated
    })
  }

  const handleErrorChunk = (chunk: ChatChunk, assistantMessageId: string) => {
    setMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.findIndex(m => m.id === assistantMessageId)
      if (lastIndex !== -1) {
        updated[lastIndex] = {
          ...updated[lastIndex],
          content: updated[lastIndex].content + `\n\nError: ${chunk.error}`
        }
      }
      return updated
    })
  }

  const handleChunk = (chunk: ChatChunk, assistantMessageId: string) => {
    switch (chunk.type) {
      case 'text':
        handleTextChunk(chunk, assistantMessageId)
        break

      case 'tool_use':
        handleToolUseChunk(chunk)
        break

      case 'tool_result':
        handleToolResultChunk(chunk)
        break

      case 'error':
        handleErrorChunk(chunk, assistantMessageId)
        break

      case 'done':
        // Clean up empty assistant messages
        setMessages(prev => prev.filter(m => m.role !== 'assistant' || m.content.trim() !== ''))
        break
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle autocomplete navigation
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < mentionSuggestions.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : mentionSuggestions.length - 1
        )
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleMentionSelect(mentionSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionSuggestions([])
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearConversation = () => {
    setMessages([])
    setExpandedTools(new Set())
    if (claudeServiceRef.current) {
      claudeServiceRef.current.clearHistory()
    }
  }

  return (
    <div
      className="h-full flex flex-col relative"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="h-14 flex items-center justify-between px-4 relative"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.8) 0%, rgba(16, 20, 32, 0.9) 100%)'
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.02))'
          }}
        />
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
              boxShadow: '0 0 15px rgba(0, 212, 255, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
            }}
          >
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-semibold text-white">Claude</span>
            <span className="text-xs text-slate-500 ml-2">Agent</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as ModelId)}
            className="text-xs bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-slate-400 hover:text-white hover:border-white/20 transition-all cursor-pointer focus:outline-none focus:border-cyan-500/50"
            style={{ minWidth: '120px' }}
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.id} value={model.id} className="bg-slate-900">
                {model.name}
              </option>
            ))}
          </select>

          {/* New Chat Button */}
          <button
            onClick={clearConversation}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1.5"
            title="Start new conversation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            New
          </button>

          {/* Integrations Button */}
          <button
            onClick={() => setShowIntegrations(true)}
            className="p-2.5 rounded-xl hover:bg-white/5 transition-all"
            title="Configure integrations"
          >
            <Puzzle className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-xl transition-all ${
              showSettings ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
            style={{
              border: showSettings ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent'
            }}
          >
            <Settings2 className={`w-5 h-5 ${showSettings ? 'text-cyan-400' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div
          className="p-4 space-y-5 overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.95) 0%, rgba(15, 20, 35, 0.98) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            maxHeight: '60vh',
          }}
        >
          {/* API Key Section */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-medium">Anthropic API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="input-metallic w-full text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              Your API key is stored locally and never sent to any server except Anthropic.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Custom Instructions Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400 font-medium">Custom Instructions</label>
              <button
                onClick={() => resetCustomInstructions()}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to defaults
              </button>
            </div>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Add custom instructions to personalize AssistantOS..."
              rows={8}
              className="input-metallic w-full text-sm resize-y min-h-[120px]"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            />
            <p className="text-xs text-slate-500 mt-2">
              These instructions are added to every conversation. Use Markdown formatting.
              Examples: coding style preferences, communication style, project-specific rules.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Context Preview Section */}
          <div>
            <button
              onClick={() => setShowContextPreview(!showContextPreview)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              {showContextPreview ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span>Current Context (auto-injected)</span>
            </button>
            {showContextPreview && (
              <pre
                className="mt-3 p-3 rounded-lg text-xs text-slate-500 overflow-auto whitespace-pre-wrap"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  maxHeight: '200px',
                  fontFamily: 'ui-monospace, monospace',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {contextPreview || 'Loading context...'}
              </pre>
            )}
            <p className="text-xs text-slate-500 mt-2">
              This context is automatically gathered and included in every message.
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                boxShadow: '0 0 30px rgba(0, 212, 255, 0.1)'
              }}
            >
              <Sparkles className="w-10 h-10 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Welcome to AssistantOS</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              Your AI assistant with file access and command execution. Ask me to read files, write code, or run commands.
            </p>
            {!workspacePath && (
              <p className="text-xs text-amber-400 mt-3">
                Select a workspace folder to get started.
              </p>
            )}
          </div>
        ) : (
          messages
            .filter(m => m.role !== 'assistant' || m.content.trim() !== '')
            .map((message) => (
            <div key={message.id}>
              {message.role === 'tool' ? (
                // Collapsible tool execution display
                <div
                  className="mx-8 rounded-lg text-xs font-mono cursor-pointer select-none"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.03)'
                  }}
                  onClick={() => toggleToolExpanded(message.id)}
                >
                  <div className="flex items-center gap-2 text-slate-500 px-3 py-1.5 hover:text-slate-400 transition-colors">
                    {expandedTools.has(message.id) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {message.toolName === 'bash' ? (
                      <Terminal className="w-3 h-3" />
                    ) : (
                      <FileText className="w-3 h-3" />
                    )}
                    <span>{message.toolName}</span>
                    {message.toolResult && !expandedTools.has(message.id) && (
                      <span className="text-slate-600 ml-1">
                        {message.toolResult.split('\n').length > 1
                          ? `(${message.toolResult.split('\n').length} lines)`
                          : ''}
                      </span>
                    )}
                  </div>
                  {expandedTools.has(message.id) && message.toolResult && (
                    <pre
                      className="px-3 pb-2 text-slate-500 whitespace-pre-wrap overflow-hidden border-t border-white/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {message.toolResult}
                    </pre>
                  )}
                </div>
              ) : (
                // User or assistant message
                <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                  {message.role === 'assistant' && (
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                        boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
                      }}
                    >
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl relative overflow-hidden`}
                    style={message.role === 'user' ? {
                      background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
                      color: '#0c0f1a',
                      boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
                    } : {
                      background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.8) 0%, rgba(20, 28, 45, 0.9) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#e2e8f0'
                    }}
                  >
                    {message.role === 'assistant' && (
                      <div
                        className="absolute top-0 left-[10%] right-[10%] h-px"
                        style={{
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)'
                        }}
                      />
                    )}
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                onClick={(e) => {
                                  if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                                    e.preventDefault()
                                    window.electronAPI?.shell.openExternal(href)
                                  }
                                }}
                                className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                              >
                                {children}
                              </a>
                            )
                          }}
                        >{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: 'linear-gradient(180deg, rgba(50, 60, 80, 0.8) 0%, rgba(35, 45, 65, 0.9) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <User className="w-4 h-4 text-slate-300" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.trim() === '' && (
          <div className="flex gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
              }}
            >
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.8) 0%, rgba(20, 28, 45, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
        {/* Active mentions indicator */}
        {(activeMentions.length > 0 || activeDocuments.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
            {activeMentions.length > 0 && (
              <>
                <span className="text-slate-500">Integrations:</span>
                {activeMentions.map(id => (
                  <span
                    key={id}
                    className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  >
                    @{id}
                  </span>
                ))}
              </>
            )}
            {activeDocuments.length > 0 && (
              <>
                <span className="text-slate-500 ml-2">Documents:</span>
                {activeDocuments.map(doc => (
                  <span
                    key={doc.path}
                    className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  >
                    📄 {doc.name}
                  </span>
                ))}
              </>
            )}
          </div>
        )}

        <div className="relative flex gap-3">
          {/* Autocomplete dropdown */}
          {mentionSuggestions.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-12 mb-2 rounded-xl overflow-hidden z-10 max-h-80 overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)'
              }}
            >
              {mentionSuggestions.map((suggestion, index) => {
                const isDocument = suggestion.type === 'document'
                return (
                  <button
                    key={suggestion.mention}
                    onClick={() => handleMentionSelect(suggestion)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === selectedSuggestionIndex
                        ? isDocument ? 'bg-violet-500/20' : 'bg-cyan-500/20'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {isDocument ? (
                      <span className="text-violet-400 text-sm">
                        {(suggestion as import('../../services/mentions/parser').FileMentionSuggestion).isDirectory ? '📁' : '📄'}
                      </span>
                    ) : (
                      <span className="text-cyan-400 text-sm">🔌</span>
                    )}
                    <code className={`text-sm font-medium ${isDocument ? 'text-violet-400' : 'text-cyan-400'}`}>
                      {suggestion.mention}
                    </code>
                    <span className="text-white text-sm">{suggestion.name}</span>
                    <span className="text-slate-500 text-xs truncate flex-1">
                      {suggestion.description}
                    </span>
                  </button>
                )
              })}
              <div className="px-4 py-1.5 text-xs text-slate-500 border-t border-white/5">
                <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400">Tab</kbd> or
                <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400 ml-1">Enter</kbd> to select
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... Use @ for integrations or documents"
            className="input-metallic flex-1 text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="btn-primary px-4"
            style={{
              opacity: input.trim() && !isLoading ? 1 : 0.5,
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed'
            }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Integrations Modal */}
      <IntegrationsModal isOpen={showIntegrations} onClose={handleIntegrationsClose} />
    </div>
  )
}
