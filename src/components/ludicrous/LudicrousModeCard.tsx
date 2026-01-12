/**
 * LUDICROUS MODE Card
 *
 * Compact agent view showing:
 * - Status and model
 * - Recent messages
 * - Quick input for sending messages
 */

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Maximize2, Trash2, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useAppStore, AVAILABLE_MODELS } from '../../stores/appStore'
import { useAgentStore, type Agent, type AgentStatus, type Message } from '../../stores/agentStore'
import { ClaudeService } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt } from '../../services/systemPrompt'

// Status colors
const STATUS_COLORS: Record<AgentStatus, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Idle' },
  working: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Working' },
  queued: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Queued' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error' },
}

interface LudicrousModeCardProps {
  agent: Agent
  onExpand: () => void
}

export function LudicrousModeCard({ agent, onExpand }: LudicrousModeCardProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)

  // App store
  const apiKey = useAppStore(state => state.apiKey)
  const workspacePath = useAppStore(state => state.workspacePath)
  const openFiles = useAppStore(state => state.openFiles)
  const currentFile = useAppStore(state => state.currentFile)
  const customInstructions = useAppStore(state => state.customInstructions)
  const maxTokens = useAppStore(state => state.maxTokens)
  const kanbanSettings = useAppStore(state => state.kanbanSettings)  // [Bug Fix] Added for custom tasks folder

  // Agent store actions
  const addMessage = useAgentStore(state => state.addMessage)
  const updateMessage = useAgentStore(state => state.updateMessage)
  const clearMessages = useAgentStore(state => state.clearMessages)
  const updateAgentStatus = useAgentStore(state => state.updateAgentStatus)

  // Get last 5 messages
  const recentMessages = agent.messages.slice(-5)
  const modelTier = AVAILABLE_MODELS.find(m => m.id === agent.model)?.tier || 'sonnet'
  const statusConfig = STATUS_COLORS[agent.status]

  // Initialize Claude service
  useEffect(() => {
    if (apiKey) {
      claudeServiceRef.current = new ClaudeService(apiKey, agent.model, maxTokens)
    }
  }, [apiKey, agent.model, maxTokens])

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agent.messages])

  // Handle quick message send
  const handleSend = async () => {
    if (!input.trim() || !claudeServiceRef.current || isLoading) return

    const userInput = input.trim()
    setInput('')
    setIsLoading(true)
    updateAgentStatus(agent.id, 'working')

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    }
    addMessage(agent.id, userMessage)

    try {
      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      addMessage(agent.id, assistantMessage)

      // Prepare for chat
      // [Bug Fix] Pass custom tasks folder from settings
      const systemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions,
        [],
        null,
        kanbanSettings.customTasksFolder
      )
      const toolExecutor = createToolExecutor(workspacePath || '.', agent.id, agent.name)

      // Stream response
      for await (const chunk of claudeServiceRef.current.chat(
        userInput,
        allTools,
        systemPrompt,
        toolExecutor
      )) {
        if (chunk.type === 'text') {
          const currentAgent = useAgentStore.getState().getAgent(agent.id)
          const currentMsg = currentAgent?.messages.find(m => m.id === assistantMessage.id)
          updateMessage(agent.id, assistantMessage.id, {
            content: (currentMsg?.content || '') + (chunk.text || ''),
          })
        }
      }

      updateAgentStatus(agent.id, 'idle')
    } catch (error) {
      console.error('Ludicrous mode chat error:', error)
      updateAgentStatus(agent.id, 'error', error instanceof Error ? error.message : 'Error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="
      flex flex-col h-[400px]
      bg-slate-800/50 border border-white/5 rounded-xl
      overflow-hidden
    ">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-medium text-white truncate max-w-[150px]">
              {agent.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`
                text-xs px-1.5 py-0.5 rounded
                ${statusConfig.bg} ${statusConfig.text}
              `}>
                {agent.status === 'working' && (
                  <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                )}
                {statusConfig.label}
              </span>
              <span className={`
                text-[10px] px-1.5 py-0.5 rounded uppercase
                ${modelTier === 'opus' ? 'bg-violet-500/20 text-violet-400' : ''}
                ${modelTier === 'sonnet' ? 'bg-cyan-500/20 text-cyan-400' : ''}
                ${modelTier === 'haiku' ? 'bg-emerald-500/20 text-emerald-400' : ''}
              `}>
                {modelTier}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onExpand}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Expand to full view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => clearMessages(agent.id)}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Clear messages"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {recentMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No messages yet
          </div>
        ) : (
          recentMessages.map(message => (
            <div
              key={message.id}
              className={`
                text-xs rounded-lg px-3 py-2
                ${message.role === 'user'
                  ? 'bg-cyan-500/10 text-cyan-100 ml-4'
                  : message.role === 'tool'
                  ? 'bg-violet-500/10 text-violet-200 mr-4'
                  : 'bg-slate-700/50 text-slate-200 mr-4'
                }
              `}
            >
              {message.role === 'tool' ? (
                <span className="text-violet-400">🔧 {message.toolName}</span>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none line-clamp-3">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Input */}
      <div className="border-t border-white/5 p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Quick message..."
            disabled={isLoading || !apiKey}
            className="
              flex-1 px-3 py-2 text-sm rounded-lg
              bg-slate-700/50 border border-white/10
              text-white placeholder-slate-500
              focus:outline-none focus:border-cyan-500/50
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !apiKey}
            className="
              px-3 py-2 rounded-lg
              bg-cyan-500 hover:bg-cyan-600
              disabled:bg-slate-700 disabled:text-slate-500
              text-white transition-colors
            "
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
