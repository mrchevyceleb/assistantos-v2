import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Settings2, Sparkles, Terminal, FileText, ChevronDown, ChevronRight, RotateCcw, Eye, EyeOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useAppStore } from '../../stores/appStore'
import { ClaudeService, type ChatChunk } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt } from '../../services/systemPrompt'
import { gatherDynamicContext, formatContextForPrompt } from '../../services/contextService'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolResult?: string
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
  } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showContextPreview, setShowContextPreview] = useState(false)
  const [contextPreview, setContextPreview] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)

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
      claudeServiceRef.current = new ClaudeService(apiKey)
    } else {
      claudeServiceRef.current = null
    }
  }, [apiKey])

  // Update context preview when toggled or workspace changes
  useEffect(() => {
    if (showContextPreview) {
      gatherDynamicContext(workspacePath, openFiles, currentFile)
        .then((context) => setContextPreview(formatContextForPrompt(context)))
        .catch(() => setContextPreview('Error loading context'))
    }
  }, [showContextPreview, workspacePath, openFiles, currentFile])

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
      claudeServiceRef.current = new ClaudeService(apiKey)
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
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
      const toolExecutor = createToolExecutor(workspacePath)

      // Assemble full system prompt with all three layers
      const fullSystemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions
      )

      const stream = claudeServiceRef.current.chat(
        input.trim(),
        allTools,
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

  const handleChunk = (chunk: ChatChunk, assistantMessageId: string) => {
    switch (chunk.type) {
      case 'text':
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
        break

      case 'tool_use':
        if (chunk.toolName && chunk.toolInput) {
          // Insert tool message BEFORE the assistant message so assistant text stays at bottom
          setMessages(prev => {
            const newToolMessage: Message = {
              id: `tool-${chunk.toolId}`,
              role: 'tool',
              content: `Using ${chunk.toolName}`,
              toolName: chunk.toolName,
              timestamp: new Date(),
            }
            // Find the last assistant message index (iterate backwards)
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
        break

      case 'tool_result':
        // Update tool message with result
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
        break

      case 'error':
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
        break

      case 'done':
        // Clean up empty assistant messages
        setMessages(prev => prev.filter(m => m.role !== 'assistant' || m.content.trim() !== ''))
        break
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              Clear
            </button>
          )}
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
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
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
    </div>
  )
}
