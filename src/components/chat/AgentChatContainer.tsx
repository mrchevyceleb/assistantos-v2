/**
 * Agent Chat Container
 *
 * Wraps chat functionality for a specific agent from the agent store.
 * Each agent gets its own isolated chat session with:
 * - Independent ClaudeService instance
 * - Messages stored in agent store
 * - Per-agent model selection
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Settings2, Sparkles, Terminal, FileText, ChevronDown, ChevronRight, RefreshCw, Trash2, Star, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Stores
import { useAppStore, AVAILABLE_MODELS, type ModelId } from '../../stores/appStore'
import { useAgentStore, type Message, type AgentStatus } from '../../stores/agentStore'
import { useTabStore } from '../../stores/tabStore'

// Services
import { ClaudeService, type ChatChunk } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt, type EnabledIntegration, type MemoryContext } from '../../services/systemPrompt'
import { getCachedMCPTools } from '../../services/toolCache'
import {
  parseMessage,
  getUnifiedSuggestions,
  getPartialMention,
  completeMention,
  type UnifiedSuggestion,
  type DocumentMention
} from '../../services/mentions/parser'
import { generateChatTitle } from '../../services/titleGenerator'
import { useLinkHandler } from '../../hooks/useLinkHandler'

// Components
import { SettingsModal } from '../settings/SettingsModal'

interface AgentChatContainerProps {
  agentId: string
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
 * Prepare all enabled MCP tools
 */
async function prepareAllEnabledTools(
  integrationConfigs: Record<string, { enabled: boolean; envVars: Record<string, string> }>
) {
  const enabledIds = Object.entries(integrationConfigs)
    .filter(([_, config]) => config.enabled)
    .map(([id]) => id)

  if (enabledIds.length === 0) return allTools

  try {
    const mcpTools = await getCachedMCPTools(enabledIds)
    return [...allTools, ...mcpTools]
  } catch (e) {
    console.error('Failed to load MCP tools:', e)
    return allTools
  }
}

export function AgentChatContainer({ agentId }: AgentChatContainerProps) {
  // App store (global settings)
  const apiKey = useAppStore(state => state.apiKey)
  const workspacePath = useAppStore(state => state.workspacePath)
  const openFiles = useAppStore(state => state.openFiles)
  const currentFile = useAppStore(state => state.currentFile)
  const customInstructions = useAppStore(state => state.customInstructions)
  const maxTokens = useAppStore(state => state.maxTokens)
  const integrationConfigs = useAppStore(state => state.integrationConfigs)
  const memoryEnabled = useAppStore(state => state.memoryEnabled)

  // Agent store (per-agent state)
  const agent = useAgentStore(state => state.getAgent(agentId))
  const addMessage = useAgentStore(state => state.addMessage)
  const updateMessage = useAgentStore(state => state.updateMessage)
  const clearMessages = useAgentStore(state => state.clearMessages)
  const updateAgentStatus = useAgentStore(state => state.updateAgentStatus)
  const updateAgentName = useAgentStore(state => state.updateAgentName)
  const updateAgentModel = useAgentStore(state => state.updateAgentModel)

  // Tab store
  const updateTab = useTabStore(state => state.updateTab)
  const activeTab = useTabStore(state => state.getActiveTab())

  // Local UI state
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [mentionSuggestions, setMentionSuggestions] = useState<UnifiedSuggestion[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [activeDocuments, setActiveDocuments] = useState<DocumentMention[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { handleLinkClick } = useLinkHandler()

  // Get messages from agent
  const messages = agent?.messages || []
  const agentModel = agent?.model || 'claude-sonnet-4-20250514'

  // Initialize Claude service for this agent
  useEffect(() => {
    if (apiKey && agent) {
      claudeServiceRef.current = new ClaudeService(apiKey, agent.model, maxTokens)
    } else {
      claudeServiceRef.current = null
    }
  }, [apiKey, agent?.model, maxTokens])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Toggle tool expanded state
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

  // Handle model change for this agent
  const handleModelChange = (model: ModelId) => {
    updateAgentModel(agentId, model)
    if (claudeServiceRef.current) {
      claudeServiceRef.current.setModel(model)
    }
  }

  // Clear chat handler
  const handleClearChat = () => {
    clearMessages(agentId)
    if (claudeServiceRef.current) {
      claudeServiceRef.current.clearHistory()
    }
    updateAgentName(agentId, 'New Chat')
    if (activeTab?.type === 'agent' && activeTab.agentId === agentId) {
      updateTab(activeTab.id, { title: 'New Chat' })
    }
  }

  // Handle input change with mention detection
  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    // Parse mentions
    const { integrations, documents } = await parseMessage(value, workspacePath)
    setActiveMentions(integrations)
    setActiveDocuments(documents)

    // Get mention suggestions
    const partialMention = getPartialMention(value, e.target.selectionStart || 0)
    if (partialMention) {
      const suggestions = await getUnifiedSuggestions(partialMention, workspacePath)
      setMentionSuggestions(suggestions)
      setSelectedSuggestionIndex(0)
    } else {
      setMentionSuggestions([])
    }
  }

  // Handle suggestion selection
  const selectSuggestion = (suggestion: UnifiedSuggestion) => {
    if (!textareaRef.current) return

    const cursorPos = textareaRef.current.selectionStart || 0
    const newInput = completeMention(input, cursorPos, suggestion)
    setInput(newInput)
    setMentionSuggestions([])

    // Re-parse mentions
    parseMessage(newInput, workspacePath).then(({ integrations, documents }) => {
      setActiveMentions(integrations)
      setActiveDocuments(documents)
    })
  }

  // Send message handler
  const handleSendMessage = async () => {
    if (!input.trim() || !claudeServiceRef.current || isLoading || !agent) return

    const userInput = input.trim()
    const isFirstMessage = messages.length === 0

    // Create user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    }

    addMessage(agentId, userMessage)
    setInput('')
    setIsLoading(true)
    updateAgentStatus(agentId, 'working')

    try {
      // Generate title from first message
      if (isFirstMessage) {
        generateChatTitle(userInput, apiKey).then(title => {
          updateAgentName(agentId, title)
          if (activeTab?.type === 'agent' && activeTab.agentId === agentId) {
            updateTab(activeTab.id, { title })
          }
        }).catch(console.error)
      }

      // Read document context
      const documentContext = await readDocumentContext(activeDocuments)
      const messageWithContext = userInput + documentContext

      // Prepare tools and system prompt
      const tools = await prepareAllEnabledTools(integrationConfigs)
      const systemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions,
        [], // enabled integrations
        null // memory context
      )

      // Create tool executor with agent context for file locking
      const toolExecutor = createToolExecutor(workspacePath, agentId, agent.name)

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      addMessage(agentId, assistantMessage)

      // Stream response
      for await (const chunk of claudeServiceRef.current.chat(
        messageWithContext,
        tools,
        systemPrompt,
        toolExecutor
      )) {
        if (chunk.type === 'text') {
          updateMessage(agentId, assistantMessage.id, {
            content: (useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || '') + chunk.content,
          })
        } else if (chunk.type === 'tool_use') {
          // Add tool message
          const toolMessage: Message = {
            id: `msg-${Date.now()}-tool-${chunk.toolName}`,
            role: 'tool',
            content: `Using tool: ${chunk.toolName}`,
            timestamp: new Date(),
            toolName: chunk.toolName,
          }
          addMessage(agentId, toolMessage)
        } else if (chunk.type === 'tool_result') {
          // Update tool message with result
          const toolMessages = useAgentStore.getState().getAgent(agentId)?.messages.filter(m => m.role === 'tool') || []
          const lastToolMsg = toolMessages[toolMessages.length - 1]
          if (lastToolMsg) {
            updateMessage(agentId, lastToolMsg.id, {
              toolResult: typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result),
            })
          }
        } else if (chunk.type === 'error') {
          updateMessage(agentId, assistantMessage.id, {
            content: (useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || '') + `\n\nError: ${chunk.error}`,
          })
        }
      }

      updateAgentStatus(agentId, 'idle')
    } catch (error) {
      console.error('Chat error:', error)
      updateAgentStatus(agentId, 'error', error instanceof Error ? error.message : 'Unknown error')

      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`,
        timestamp: new Date(),
      }
      addMessage(agentId, errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention suggestions navigation
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => (prev + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev === 0 ? mentionSuggestions.length - 1 : prev - 1)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        selectSuggestion(mentionSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionSuggestions([])
        return
      }
    }

    // Send on Enter (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // No agent found
  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Agent not found
      </div>
    )
  }

  // No API key
  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <Bot className="w-12 h-12 text-slate-500" />
        <div>
          <h3 className="text-lg font-medium text-white mb-2">API Key Required</h3>
          <p className="text-slate-400 text-sm mb-4">
            Enter your Anthropic API key to start chatting
          </p>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
          >
            Open Settings
          </button>
        </div>
        {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-medium text-white">{agent.name}</span>
          {memoryEnabled && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
              <Brain className="w-3 h-3" />
              Memory
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <select
            value={agentModel}
            onChange={(e) => handleModelChange(e.target.value as ModelId)}
            className="
              px-2 py-1 text-xs rounded
              bg-slate-800 border border-white/10
              text-slate-300 hover:text-white
              focus:outline-none focus:border-cyan-500/50
            "
          >
            {AVAILABLE_MODELS.map(model => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>

          {/* Clear Chat */}
          <button
            onClick={handleClearChat}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-10 h-10 text-cyan-400/50 mb-4" />
            <p className="text-slate-400">Start a conversation with your AI assistant</p>
            <p className="text-xs text-slate-500 mt-2">
              Use @mentions to reference files or integrations
            </p>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role !== 'user' && (
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                  ${message.role === 'tool' ? 'bg-violet-500/20' : 'bg-cyan-500/20'}
                `}>
                  {message.role === 'tool' ? (
                    <Terminal className="w-4 h-4 text-violet-400" />
                  ) : (
                    <Bot className="w-4 h-4 text-cyan-400" />
                  )}
                </div>
              )}

              <div className={`
                max-w-[80%] rounded-lg px-4 py-2
                ${message.role === 'user'
                  ? 'bg-cyan-500/20 text-white'
                  : message.role === 'tool'
                  ? 'bg-slate-800/50 border border-white/5'
                  : 'bg-slate-800/50'
                }
              `}>
                {message.role === 'tool' ? (
                  <div>
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => toggleToolExpanded(message.id)}
                    >
                      {expandedTools.has(message.id) ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-sm text-violet-400 font-medium">{message.toolName}</span>
                    </div>
                    {expandedTools.has(message.id) && message.toolResult && (
                      <pre className="mt-2 text-xs text-slate-400 overflow-x-auto max-h-48 overflow-y-auto">
                        {message.toolResult}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            </div>
            <div className="bg-slate-800/50 rounded-lg px-4 py-2">
              <span className="text-slate-400 text-sm">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-white/5 p-4">
        {/* Mention Suggestions */}
        {mentionSuggestions.length > 0 && (
          <div className="mb-2 bg-slate-800 border border-white/10 rounded-lg overflow-hidden">
            {mentionSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.type === 'integration' ? suggestion.id : suggestion.path}
                className={`
                  w-full px-3 py-2 text-left text-sm flex items-center gap-2
                  ${index === selectedSuggestionIndex ? 'bg-cyan-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}
                `}
                onClick={() => selectSuggestion(suggestion)}
              >
                {suggestion.type === 'integration' ? '🔌' : '📄'}
                <span>{suggestion.type === 'integration' ? suggestion.mention : suggestion.name}</span>
                {suggestion.type === 'integration' && (
                  <span className="text-xs text-slate-500">{suggestion.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Active Mentions Display */}
        {(activeMentions.length > 0 || activeDocuments.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-1">
            {activeMentions.map(mention => (
              <span key={mention} className="px-2 py-0.5 text-xs rounded bg-cyan-500/20 text-cyan-400">
                @{mention}
              </span>
            ))}
            {activeDocuments.map(doc => (
              <span key={doc.path} className="px-2 py-0.5 text-xs rounded bg-violet-500/20 text-violet-400">
                📄 {doc.name}
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message your assistant... (use @ for mentions)"
            rows={1}
            className="
              flex-1 px-4 py-3 rounded-lg resize-none
              bg-slate-800 border border-white/10
              text-white placeholder-slate-500
              focus:outline-none focus:border-cyan-500/50
            "
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="
              px-4 py-3 rounded-lg
              bg-cyan-500 hover:bg-cyan-600
              disabled:bg-slate-700 disabled:text-slate-500
              text-white transition-colors
            "
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  )
}
