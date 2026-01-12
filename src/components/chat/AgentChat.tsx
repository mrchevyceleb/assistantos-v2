import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Settings2, Sparkles, Terminal, FileText, ChevronDown, ChevronRight, RefreshCw, Puzzle, Clock, Trash2, Star, Brain, Zap, Mic, MicOff, Cpu, Wand2, Atom, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Store
import { useAppStore, AVAILABLE_MODELS, type ModelId, PRESET_AVATARS } from '../../stores/appStore'

// Types
import { PromptShortcut } from '@/types/shortcut'

// Shortcut Parser
import { getPartialCommand, getCommandSuggestions, completeCommand } from '@/services/shortcuts/parser'

// Services
import { ClaudeService, type ChatChunk } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt, type EnabledIntegration, type MemoryContext } from '../../services/systemPrompt'
import { getCachedMCPTools, invalidateToolCache } from '../../services/toolCache'
import {
  parseMessage,
  getUnifiedSuggestions,
  getPartialMention,
  completeMention,
  clearMentionCache,
  type UnifiedSuggestion,
  type DocumentMention
} from '../../services/mentions/parser'
import {
  generateConversationId,
  generateTitle,
  exportToMarkdown,
  type Conversation,
  type ConversationMeta
} from '../../services/conversationStorage'
import { processConversationForMemory } from '../../services/memory/extractionService'
import { isTrivialMessage } from '../../services/memory/retrievalService'
import {
  getContextUsage,
  formatTokenCount,
  getContextUsageColor,
  shouldCompact,
  generateCompactionPrompt,
  formatCompactedSummary,
  type ContextUsage
} from '../../services/tokenService'
import { useLinkHandler } from '../../hooks/useLinkHandler'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'

// Components
import { IntegrationsModal } from '../settings/IntegrationsModal'
import { SettingsModal } from '../settings/SettingsModal'
import { MCPSlideout } from './MCPSlideout'
import { ChatToolbar } from './ChatToolbar'
import { ChatMessageContextMenu, extractCodeBlocks } from './ChatMessageContextMenu'
import { CreateShortcutDialog } from './CreateShortcutDialog'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolResult?: string
  bookmarked?: boolean
  isContextSummary?: boolean
}

/**
 * Preset avatar icon component for rendering agent preset icons
 */
function PresetAvatarIcon({ iconName, size = 16 }: { iconName: string; size?: number }) {
  const iconProps = { className: 'text-white', size }
  switch (iconName) {
    case 'Bot': return <Bot {...iconProps} />
    case 'Brain': return <Brain {...iconProps} />
    case 'Sparkles': return <Sparkles {...iconProps} />
    case 'Cpu': return <Cpu {...iconProps} />
    case 'Zap': return <Zap {...iconProps} />
    case 'Terminal': return <Terminal {...iconProps} />
    case 'Wand2': return <Wand2 {...iconProps} />
    case 'Atom': return <Atom {...iconProps} />
    case 'Globe': return <Globe {...iconProps} />
    case 'Star': return <Star {...iconProps} />
    default: return <Bot {...iconProps} />
  }
}

/**
 * Agent avatar component that renders based on avatar settings
 */
interface AgentAvatarProps {
  avatarType: 'default' | 'custom' | 'preset'
  customAvatar: string | null
  presetAvatar: string | null
  size?: 'sm' | 'md'
}

function AgentAvatar({ avatarType, customAvatar, presetAvatar, size = 'sm' }: AgentAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10'
  const iconSize = size === 'sm' ? 16 : 20

  // Custom avatar (uploaded image)
  if (avatarType === 'custom' && customAvatar) {
    return (
      <div
        className={`${sizeClass} rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden`}
        style={{
          border: '2px solid rgba(0, 212, 255, 0.4)',
          boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
        }}
      >
        <img
          src={customAvatar}
          alt="Agent"
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // Preset avatar (icon from predefined list)
  if (avatarType === 'preset' && presetAvatar) {
    const preset = PRESET_AVATARS.find(p => p.id === presetAvatar)
    const iconName = preset?.icon || 'Bot'
    return (
      <div
        className={`${sizeClass} rounded-xl flex items-center justify-center flex-shrink-0`}
        style={{
          background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
          boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
        }}
      >
        <PresetAvatarIcon iconName={iconName} size={iconSize} />
      </div>
    )
  }

  // Default avatar
  return (
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center flex-shrink-0`}
      style={{
        background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
      }}
    >
      <Bot className="text-white" size={iconSize} />
    </div>
  )
}

/**
 * Format timestamp for display
 * Format: "Jan 10, 11:15 AM"
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
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
  const {apiKey,
    workspacePath,
    openFiles,
    currentFile,
    customInstructions,
    selectedModel,
    setSelectedModel,
    maxTokens,
    integrationConfigs,
    pendingChatPrompt,
    setPendingChatPrompt,
    pendingChatInput,
    setPendingChatInput,
    memoryEnabled,
    memoryUserId,
    shortcuts,
    userProfilePicture,
    agentAvatarType,
    agentCustomAvatar,
    agentPresetAvatar,
    showContextUsage} = useAppStore()
  const { handleLinkClick } = useLinkHandler()

  // Speech recognition for voice dictation
  const {
    isSupported: isSpeechSupported,
    isRecording,
    transcript,
    interimTranscript,
    error: speechError,
    toggleRecording,
    reset: resetSpeech
  } = useSpeechRecognition()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [showIntegrations, setShowIntegrations] = useState(false)
  const [showMCPSlideout, setShowMCPSlideout] = useState(false)
  const [mentionSuggestions, setMentionSuggestions] = useState<UnifiedSuggestion[]>([])
  const [commandSuggestions, setCommandSuggestions] = useState<PromptShortcut[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [activeDocuments, setActiveDocuments] = useState<DocumentMention[]>([])
  // Conversation persistence state
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [savedConversations, setSavedConversations] = useState<ConversationMeta[]>([])
  const [showLoadDropdown, setShowLoadDropdown] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [messageContextMenu, setMessageContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null)
  const [showCreateShortcut, setShowCreateShortcut] = useState(false)
  // Context usage tracking
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [showContextTooltip, setShowContextTooltip] = useState(false)
  const [lastSystemPrompt, setLastSystemPrompt] = useState('')
  const [lastTools, setLastTools] = useState<any[]>([])
  const [hasShownCompactionWarning, setHasShownCompactionWarning] = useState(false)
  const [showCompactionBanner, setShowCompactionBanner] = useState(false)
  // Auto-compaction tracking
  const [isAutoCompacting, setIsAutoCompacting] = useState(false)
  const hasAutoCompactedRef = useRef(false)
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

  // Calculate context usage when messages change (only if showContextUsage is enabled)
  useEffect(() => {
    if (!showContextUsage) {
      setContextUsage(null)
      return
    }

    // Calculate context usage with cached system prompt and tools
    const usage = getContextUsage(
      messages.map(m => ({
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        toolResult: m.toolResult
      })),
      lastSystemPrompt,
      lastTools,
      selectedModel
    )
    setContextUsage(usage)

    // Show compaction banner when context exceeds 80% (only once per session)
    if (usage.percentage >= 80 && !hasShownCompactionWarning && messages.length > 10) {
      setShowCompactionBanner(true)
      setHasShownCompactionWarning(true)
    }
  }, [messages, lastSystemPrompt, lastTools, selectedModel, showContextUsage, hasShownCompactionWarning])

  // Auto-compaction when context exceeds threshold
  useEffect(() => {
    const performAutoCompaction = async () => {
      // Only auto-compact once per conversation and when conditions are met
      if (
        !contextUsage ||
        isAutoCompacting ||
        hasAutoCompactedRef.current ||
        !shouldCompact(contextUsage.percentage) ||
        messages.length < 15 || // Need enough messages to compact
        isLoading ||
        !apiKey
      ) {
        return
      }

      // Mark as compacting to prevent double-execution
      setIsAutoCompacting(true)
      hasAutoCompactedRef.current = true

      try {
        // Generate compaction prompt for older messages (keep last 10)
        const messagesForPrompt = messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'tool',
          content: m.content,
          toolName: m.toolName,
          toolResult: m.toolResult
        }))

        const compactionPrompt = generateCompactionPrompt(messagesForPrompt, 10)

        if (!compactionPrompt) {
          setIsAutoCompacting(false)
          return
        }

        // Use Haiku for fast compaction
        const compactionService = new ClaudeService(apiKey, 'claude-3-5-haiku-20241022', 2000)

        // Stream the compaction response
        let summary = ''
        for await (const event of compactionService.streamMessage(
          [{ role: 'user', content: compactionPrompt }],
          'You are a helpful assistant that creates concise conversation summaries. Focus on preserving essential context.'
        )) {
          if (event.type === 'content' && event.text) {
            summary += event.text
          }
        }

        if (summary) {
          // Create the compacted summary message
          const summaryContent = formatCompactedSummary(summary)

          // Replace old messages with summary + keep recent messages
          const recentMessages = messages.slice(-10)
          const compactedMessage: Message = {
            id: `compacted-${Date.now()}`,
            role: 'assistant',
            content: summaryContent,
            timestamp: new Date(),
            isContextSummary: true
          }

          setMessages([compactedMessage, ...recentMessages])
          console.log('Auto-compaction completed: Condensed conversation history')
        }
      } catch (error) {
        console.error('Auto-compaction failed:', error)
        // Reset so user can try again
        hasAutoCompactedRef.current = false
      } finally {
        setIsAutoCompacting(false)
      }
    }

    performAutoCompaction()
  }, [contextUsage, messages, isLoading, apiKey, isAutoCompacting])

  // Sync speech recognition transcript to input field
  useEffect(() => {
    if (transcript) {
      // Append transcript to existing input with a space if needed
      setInput(prev => {
        const separator = prev.trim() ? ' ' : ''
        return prev.trim() + separator + transcript
      })
      // Reset the speech recognition transcript after syncing
      resetSpeech()
    }
  }, [transcript, resetSpeech])

  // Initialize or update Claude service when API key changes
  useEffect(() => {
    if (apiKey) {
      claudeServiceRef.current = new ClaudeService(apiKey, selectedModel, maxTokens)
    } else {
      claudeServiceRef.current = null
    }
  }, [apiKey, selectedModel, maxTokens])

  // Update model when it changes mid-chat
  useEffect(() => {
    if (claudeServiceRef.current) {
      claudeServiceRef.current.setModel(selectedModel)
    }
  }, [selectedModel])

  // Update maxTokens when it changes mid-chat
  useEffect(() => {
    if (claudeServiceRef.current) {
      claudeServiceRef.current.setMaxTokens(maxTokens)
    }
  }, [maxTokens])

  // Load saved conversations list on mount
  useEffect(() => {
    const loadConversationsList = async () => {
      try {
        const list = await window.electronAPI.conversation.list()
        setSavedConversations(list)
      } catch (e) {
        console.error('Failed to load conversations list:', e)
      }
    }
    loadConversationsList()
  }, [])

  // Handle pending chat prompts (from onboarding, etc.) - auto-sends
  useEffect(() => {
    if (pendingChatPrompt && !isLoading) {
      // Set the input and send the message
      setInput(pendingChatPrompt)
      setPendingChatPrompt(null)

      // Use a small delay to ensure UI updates, then trigger send
      setTimeout(() => {
        const sendButton = document.querySelector('[data-send-button]') as HTMLButtonElement
        if (sendButton) {
          sendButton.click()
        }
      }, 100)
    }
  }, [pendingChatPrompt, isLoading, setPendingChatPrompt])

  // Handle pending chat input (from context menu, etc.) - just populates input
  useEffect(() => {
    if (pendingChatInput) {
      // Append to existing input or set if empty
      setInput(prev => prev ? `${prev}${pendingChatInput}` : pendingChatInput)
      setPendingChatInput(null)
      // Focus the input
      setTimeout(() => {
        const textarea = document.querySelector('textarea[placeholder*="Message"]') as HTMLTextAreaElement
        if (textarea) {
          textarea.focus()
          // Move cursor to end
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length
        }
      }, 50)
    }
  }, [pendingChatInput, setPendingChatInput])

  // Save conversation handler
  const handleSaveConversation = useCallback(async () => {
    if (messages.length === 0 || isSaving) return

    setIsSaving(true)
    try {
      const convId = currentConversationId || generateConversationId()
      const now = new Date().toISOString()

      const conversationTitle = generateTitle(messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString()
      })))

      const conversation: Conversation = {
        id: convId,
        title: conversationTitle,
        createdAt: currentConversationId ? savedConversations.find(c => c.id === convId)?.createdAt || now : now,
        updatedAt: now,
        model: selectedModel,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          toolName: m.toolName,
          toolResult: m.toolResult,
          bookmarked: m.bookmarked
        })),
        bookmarks: messages.filter(m => m.bookmarked).map(m => m.id),
        workspace: workspacePath
      }

      const result = await window.electronAPI.conversation.save(conversation)
      if (result.success) {
        setCurrentConversationId(convId)
        // Refresh the list
        const list = await window.electronAPI.conversation.list()
        setSavedConversations(list)

        // Extract and save memories if enabled
        if (memoryEnabled && memoryUserId) {
          try {
            // Filter to user and assistant messages only (exclude tool messages)
            const chatMessages = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

            if (chatMessages.length > 0) {
              const extracted = processConversationForMemory(
                chatMessages,
                conversationTitle,
                workspacePath
              )

              // Save extracted facts
              if (extracted.facts.length > 0) {
                await window.electronAPI.memory.addFacts(
                  extracted.facts.map(f => ({
                    category: f.category,
                    fact: f.fact,
                    source: f.source,
                    confidence: f.confidence,
                    conversationId: convId
                  }))
                )
              }

              // Save extracted preferences
              for (const pref of extracted.preferences) {
                await window.electronAPI.memory.upsertPreference({
                  domain: pref.domain,
                  preference_key: pref.preferenceKey,
                  preference_value: pref.preferenceValue
                })
              }

              // Save conversation summary
              await window.electronAPI.memory.addSummary({
                local_conversation_id: convId,
                workspace_path: workspacePath ?? undefined,
                title: conversationTitle,
                summary: extracted.summary.summary,
                key_decisions: extracted.summary.keyDecisions,
                message_count: messages.length,
                model_used: selectedModel,
                started_at: messages[0]?.timestamp.toISOString(),
                ended_at: messages[messages.length - 1]?.timestamp.toISOString()
              })

              console.log(`Memory: Extracted ${extracted.facts.length} facts, ${extracted.preferences.length} preferences`)
            }
          } catch (memoryError) {
            console.error('Failed to save memories:', memoryError)
            // Don't fail the conversation save if memory extraction fails
          }
        }
      }
    } catch (e) {
      console.error('Failed to save conversation:', e)
    } finally {
      setIsSaving(false)
    }
  }, [messages, currentConversationId, selectedModel, workspacePath, savedConversations, isSaving, memoryEnabled, memoryUserId])

  // Load conversation handler
  const handleLoadConversation = useCallback(async (conversationId: string) => {
    try {
      const conversation = await window.electronAPI.conversation.load(conversationId)
      if (conversation) {
        // Clear current chat first
        if (claudeServiceRef.current) {
          claudeServiceRef.current.clearHistory()
        }

        // Convert to Message format (with bookmarks)
        const loadedMessages: Message[] = conversation.messages.map((m: any) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'tool',
          content: m.content,
          timestamp: new Date(m.timestamp),
          toolName: m.toolName,
          toolResult: m.toolResult,
          bookmarked: m.bookmarked || conversation.bookmarks?.includes(m.id) || false
        }))

        setMessages(loadedMessages)
        setCurrentConversationId(conversation.id)
        setExpandedTools(new Set())
        setShowLoadDropdown(false)
      }
    } catch (e) {
      console.error('Failed to load conversation:', e)
    }
  }, [])

  // Export conversation handler
  const handleExportConversation = useCallback(async () => {
    if (messages.length === 0) return

    const conversation: Conversation = {
      id: currentConversationId || 'export',
      title: generateTitle(messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString()
      }))),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: selectedModel,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        toolName: m.toolName,
        toolResult: m.toolResult,
        bookmarked: m.bookmarked
      })),
      bookmarks: messages.filter(m => m.bookmarked).map(m => m.id),
      workspace: workspacePath
    }

    const markdown = exportToMarkdown(conversation)
    const suggestedName = `${conversation.title.replace(/[^a-zA-Z0-9]/g, '-')}.md`

    await window.electronAPI.conversation.export(markdown, suggestedName)
  }, [messages, currentConversationId, selectedModel, workspacePath])

  // Delete conversation handler
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await window.electronAPI.conversation.delete(conversationId)
      const list = await window.electronAPI.conversation.list()
      setSavedConversations(list)
    } catch (e) {
      console.error('Failed to delete conversation:', e)
    }
  }, [])

  // Toggle message bookmark
  const toggleBookmark = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, bookmarked: !m.bookmarked } : m
    ))
  }, [])

  // Message context menu handlers
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault()
    setMessageContextMenu({ x: e.clientX, y: e.clientY, message })
  }, [])

  const handleCopyMessageText = useCallback(() => {
    if (messageContextMenu) {
      navigator.clipboard.writeText(messageContextMenu.message.content)
    }
  }, [messageContextMenu])

  const handleCopyMessageCode = useCallback(() => {
    if (messageContextMenu) {
      const codeBlocks = extractCodeBlocks(messageContextMenu.message.content)
      if (codeBlocks.length > 0) {
        navigator.clipboard.writeText(codeBlocks[0])
      }
    }
  }, [messageContextMenu])

  const handleResendMessage = useCallback(() => {
    if (messageContextMenu && messageContextMenu.message.role === 'user') {
      setInput(messageContextMenu.message.content)
      inputRef.current?.focus()
    }
  }, [messageContextMenu])

  const handleDeleteMessage = useCallback(() => {
    if (messageContextMenu) {
      setMessages(prev => prev.filter(m => m.id !== messageContextMenu.message.id))
    }
  }, [messageContextMenu])

  // Handle input change for @mention and /command autocomplete
  const handleInputChange = useCallback(async (value: string) => {
    setInput(value)

    // Check for partial slash command at end of input (e.g., "/mor")
    const partialCommand = getPartialCommand(value)
    if (partialCommand) {
      const suggestions = getCommandSuggestions(partialCommand, shortcuts)
      setCommandSuggestions(suggestions.slice(0, 10))
      setMentionSuggestions([])
      setSelectedSuggestionIndex(0)
      return
    }

    // Clear command suggestions if not typing a command
    setCommandSuggestions([])

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
  }, [workspacePath, shortcuts])

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

  // Complete a slash command from autocomplete
  const handleCommandSelect = useCallback((shortcut: PromptShortcut) => {
    const completed = completeCommand(input, shortcut)
    setInput(completed)
    setCommandSuggestions([])
    inputRef.current?.focus()
  }, [input])

  // Handle drag and drop of files/folders into chat
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the container entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (!workspacePath) return

    // Handle dropped files from the file tree
    const droppedPath = e.dataTransfer.getData('text/plain')
    if (droppedPath && droppedPath.startsWith(workspacePath)) {
      // Convert absolute path to relative @mention
      const relativePath = droppedPath.replace(workspacePath, '').replace(/^[\\/]/, '')
      const mention = `@${relativePath.replace(/\\/g, '/')}`

      // Add the mention to the input
      const newInput = input.trim() ? `${input.trim()} ${mention} ` : `${mention} `
      setInput(newInput)

      // Update active documents
      const parsed = await parseMessage(newInput, workspacePath)
      setActiveMentions(parsed.mentions)
      setActiveDocuments(parsed.documentMentions)

      inputRef.current?.focus()
      return
    }

    // Handle native file drops from OS
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const mentions: string[] = []

      for (const file of files) {
        // Get the file path - this is the native path from the OS
        const filePath = (file as any).path
        if (filePath && workspacePath && filePath.startsWith(workspacePath)) {
          const relativePath = filePath.replace(workspacePath, '').replace(/^[\\/]/, '')
          mentions.push(`@${relativePath.replace(/\\/g, '/')}`)
        }
      }

      if (mentions.length > 0) {
        const newInput = input.trim()
          ? `${input.trim()} ${mentions.join(' ')} `
          : `${mentions.join(' ')} `
        setInput(newInput)

        // Update active documents
        const parsed = await parseMessage(newInput, workspacePath)
        setActiveMentions(parsed.mentions)
        setActiveDocuments(parsed.documentMentions)

        inputRef.current?.focus()
      }
    }
  }, [input, workspacePath])

  // Clear caches when integrations modal closes (in case configs changed)
  const handleIntegrationsClose = useCallback(() => {
    setShowIntegrations(false)
    clearMentionCache()
    invalidateToolCache() // Refresh tools on next message
  }, [])

  // Open full integrations modal from slideout
  const handleOpenFullConfig = useCallback(() => {
    setShowMCPSlideout(false)
    setShowIntegrations(true)
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
      claudeServiceRef.current = new ClaudeService(apiKey, selectedModel, maxTokens)
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

      // Fetch memory context if enabled (skip for trivial messages to save tokens)
      let memoryContext: MemoryContext | null = null
      const trimmedInput = input.trim()
      if (memoryEnabled && memoryUserId && !isTrivialMessage(trimmedInput)) {
        try {
          const memoryData = await window.electronAPI.memory.getRelevantMemories(trimmedInput)
          if (memoryData.profile || memoryData.facts.length > 0 || memoryData.summaries.length > 0) {
            memoryContext = memoryData
          }
        } catch (e) {
          console.warn('Failed to fetch memory context:', e)
        }
      }

      // Assemble full system prompt with capability awareness and memory
      const fullSystemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions,
        enabledIntegrations,
        memoryContext
      )

      // Prepare tools (native + all enabled MCP integrations)
      // Claude Code-like behavior: all enabled tools available, no @mention required
      const tools = await prepareAllEnabledTools(integrationConfigs)

      // Cache system prompt and tools for context usage calculation
      if (showContextUsage) {
        setLastSystemPrompt(fullSystemPrompt)
        setLastTools(tools)
      }

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

    // Insert tool message BEFORE the last assistant message
    // This ensures tools render ABOVE the assistant's text response
    setMessages(prev => {
      const newToolMessage: Message = {
        id: `tool-${chunk.toolId}`,
        role: 'tool',
        content: `Using ${chunk.toolName}`,
        toolName: chunk.toolName,
        timestamp: new Date(),
      }

      // Find the LAST assistant message (should be the streaming one for this turn)
      let lastAssistantIndex = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'assistant') {
          lastAssistantIndex = i
          break
        }
      }

      // Insert tool message before the last assistant message
      if (lastAssistantIndex !== -1) {
        const updated = [...prev]
        updated.splice(lastAssistantIndex, 0, newToolMessage)
        return updated
      }

      // Fallback: append to end (shouldn't happen in normal flow)
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
    // Handle command autocomplete navigation
    if (commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < commandSuggestions.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : commandSuggestions.length - 1
        )
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleCommandSelect(commandSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCommandSuggestions([])
        return
      }
    }

    // Handle mention autocomplete navigation
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
    setCurrentConversationId(null)
    setHasShownCompactionWarning(false)
    setShowCompactionBanner(false)
    setContextUsage(null)
    setLastSystemPrompt('')
    setLastTools([])
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
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag and Drop Overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{
            background: 'rgba(0, 212, 255, 0.1)',
            border: '2px dashed rgba(0, 212, 255, 0.5)',
            borderRadius: '12px',
            margin: '8px'
          }}
        >
          <div
            className="flex flex-col items-center gap-3 p-6 rounded-xl"
            style={{
              background: 'rgba(16, 20, 32, 0.95)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              boxShadow: '0 0 30px rgba(0, 212, 255, 0.2)'
            }}
          >
            <FileText className="w-10 h-10 text-cyan-400" />
            <span className="text-lg font-medium text-white">Drop files to add as @mentions</span>
            <span className="text-sm text-slate-400">Files will be referenced in your message</span>
          </div>
        </div>
      )}
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

          {/* Context Usage Indicator */}
          {showContextUsage && contextUsage && (
            <div
              className="relative"
              onMouseEnter={() => setShowContextTooltip(true)}
              onMouseLeave={() => setShowContextTooltip(false)}
            >
              <button
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                style={{
                  background: getContextUsageColor(contextUsage.percentage) === 'red'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : getContextUsageColor(contextUsage.percentage) === 'amber'
                      ? 'rgba(251, 191, 36, 0.1)'
                      : 'rgba(34, 197, 94, 0.1)',
                  border: `1px solid ${
                    getContextUsageColor(contextUsage.percentage) === 'red'
                      ? 'rgba(239, 68, 68, 0.3)'
                      : getContextUsageColor(contextUsage.percentage) === 'amber'
                        ? 'rgba(251, 191, 36, 0.3)'
                        : 'rgba(34, 197, 94, 0.3)'
                  }`
                }}
              >
                <span className={`text-xs font-mono ${
                  getContextUsageColor(contextUsage.percentage) === 'red'
                    ? 'text-red-400'
                    : getContextUsageColor(contextUsage.percentage) === 'amber'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`}>
                  {formatTokenCount(contextUsage.total)} / {formatTokenCount(contextUsage.max)}
                </span>
              </button>

              {/* Tooltip */}
              {showContextTooltip && (
                <div
                  className="absolute top-full right-0 mt-2 z-50 p-3 rounded-lg w-56"
                  style={{
                    background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
                  }}
                >
                  <div className="text-xs font-medium text-white mb-2">Context Usage</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Messages</span>
                      <span className="text-slate-300 font-mono">{formatTokenCount(contextUsage.messages)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">System Prompt</span>
                      <span className="text-slate-300 font-mono">{formatTokenCount(contextUsage.systemPrompt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tools</span>
                      <span className="text-slate-300 font-mono">{formatTokenCount(contextUsage.tools)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-1.5 mt-1.5 flex justify-between">
                      <span className="text-white font-medium">Total</span>
                      <span className={`font-mono font-medium ${
                        getContextUsageColor(contextUsage.percentage) === 'red'
                          ? 'text-red-400'
                          : getContextUsageColor(contextUsage.percentage) === 'amber'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}>
                        {contextUsage.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {shouldCompact(contextUsage.percentage) && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-amber-400">
                      Context is high. Consider using /compact to summarize older messages.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Memory Indicator */}
          {memoryEnabled && memoryUserId && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.2)'
              }}
              title="Memory enabled - facts and preferences are being remembered"
            >
              <Brain className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-amber-400">Memory</span>
            </div>
          )}

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
            onClick={() => setShowMCPSlideout(!showMCPSlideout)}
            className={`p-2.5 rounded-xl transition-all ${
              showMCPSlideout ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
            style={{
              border: showMCPSlideout ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent'
            }}
            title="Toggle integrations"
          >
            <Puzzle className={`w-5 h-5 ${showMCPSlideout ? 'text-cyan-400' : 'text-slate-400'}`} />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2.5 rounded-xl transition-all hover:bg-white/5"
            style={{ border: '1px solid transparent' }}
            title="Settings"
          >
            <Settings2 className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Chat Toolbar */}
      <div className="relative">
        <ChatToolbar
          onSave={handleSaveConversation}
          onLoad={() => setShowLoadDropdown(!showLoadDropdown)}
          onExport={handleExportConversation}
          onClear={clearConversation}
          hasMessages={messages.length > 0}
          savedCount={savedConversations.length}
          isSaving={isSaving}
        />

        {/* Load Conversation Dropdown */}
        {showLoadDropdown && (
          <div
            className="absolute top-full left-0 mt-1 w-80 max-h-80 overflow-y-auto z-30 rounded-xl"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-sm font-medium text-white">Saved Conversations</span>
              <button
                onClick={() => setShowLoadDropdown(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            {savedConversations.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                No saved conversations yet
              </div>
            ) : (
              savedConversations.map(conv => (
                <div
                  key={conv.id}
                  className="group px-3 py-2.5 hover:bg-white/5 transition-colors cursor-pointer flex items-start gap-3"
                  onClick={() => handleLoadConversation(conv.id)}
                >
                  <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{conv.title}</div>
                    <div className="text-xs text-slate-500 truncate">{conv.preview}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(conv.updatedAt).toLocaleDateString()} • {conv.messageCount} messages
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteConversation(conv.id)
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Auto-Compaction Progress Banner */}
      {isAutoCompacting && (
        <div
          className="mx-4 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)'
          }}
        >
          <div className="animate-spin">
            <RefreshCw className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-sm text-emerald-400 font-medium">Auto-compacting conversation</span>
            <p className="text-xs text-slate-400 mt-0.5">
              Summarizing older messages to free up context space...
            </p>
          </div>
        </div>
      )}

      {/* Compaction Warning Banner */}
      {showCompactionBanner && !isAutoCompacting && (
        <div
          className="mx-4 mt-2 px-4 py-3 rounded-lg flex items-center justify-between"
          style={{
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)'
          }}
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-sm text-amber-400 font-medium">Context is getting full</span>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-compaction will activate at 80%. You can also use <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300">/compact</code> manually.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCompactionBanner(false)}
            className="p-1.5 text-slate-500 hover:text-white transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
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
          // Group messages: tool messages should appear above their associated assistant response
          (() => {
            // Debug: Log messages array if it contains tool messages
            if (messages.some(m => m.role === 'tool')) {
              console.log('[AgentChat] Messages array with tools:', messages.map(m => ({ id: m.id, role: m.role, toolName: m.toolName })))
            }

            // Build grouped messages: each assistant message includes preceding tool messages
            type MessageGroup = {
              type: 'user' | 'assistant-with-tools' | 'tools-pending'
              message: Message
              toolMessages?: Message[]
            }
            const groups: MessageGroup[] = []
            let pendingTools: Message[] = []

            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i]

              if (msg.role === 'tool') {
                // Collect tool messages - they'll be associated with the next assistant message
                pendingTools.push(msg)
              } else if (msg.role === 'assistant') {
                // Associate any pending tools with this assistant message
                // Tools appear ABOVE the assistant text in the UI
                groups.push({
                  type: 'assistant-with-tools',
                  message: msg,
                  toolMessages: pendingTools.length > 0 ? [...pendingTools] : undefined
                })
                pendingTools = []
              } else if (msg.role === 'user') {
                // User message encountered - flush any orphaned tools first
                if (pendingTools.length > 0) {
                  // These are tool messages that came before a user message (shouldn't happen normally)
                  groups.push({
                    type: 'tools-pending',
                    message: pendingTools[0],
                    toolMessages: [...pendingTools]
                  })
                  pendingTools = []
                }
                groups.push({ type: 'user', message: msg })
              }
            }

            // Handle any trailing tool messages (during streaming before assistant responds)
            if (pendingTools.length > 0) {
              groups.push({
                type: 'tools-pending',
                message: pendingTools[0],
                toolMessages: [...pendingTools]
              })
            }

            // Debug: Log groups if any tools are present
            if (groups.some(g => g.toolMessages && g.toolMessages.length > 0)) {
              console.log('[AgentChat] Message groups:', groups.map(g => ({
                type: g.type,
                messageRole: g.message.role,
                toolCount: g.toolMessages?.length || 0
              })))
            }

            // Debug logging to trace grouping issues
            if (groups.some(g => g.message.role === 'tool' && g.type !== 'tools-pending' && g.type !== 'assistant-with-tools')) {
              console.error('[AgentChat] Found tool message with wrong group type!', groups)
            }

            return groups.map((group) => {
              // Render pending tools (left-aligned, tool style) - during streaming
              if (group.type === 'tools-pending' && group.toolMessages) {
                return (
                  <div key={`pending-${group.message.id}`} className="flex gap-3">
                    <AgentAvatar
                      avatarType={agentAvatarType}
                      customAvatar={agentCustomAvatar}
                      presetAvatar={agentPresetAvatar}
                      size="sm"
                    />
                    <div className="flex-1">
                      <div className="mb-1">
                        <button
                          onClick={() => {
                            const groupId = `tools-pending-${group.message.id}`
                            if (expandedTools.has(groupId)) {
                              setExpandedTools(prev => {
                                const next = new Set(prev)
                                next.delete(groupId)
                                return next
                              })
                            } else {
                              setExpandedTools(prev => new Set([...prev, groupId]))
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-400 transition-colors"
                          style={{ background: 'rgba(0, 0, 0, 0.15)' }}
                        >
                          {expandedTools.has(`tools-pending-${group.message.id}`) ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          <Terminal className="w-3 h-3" />
                          <span>
                            {group.toolMessages.length} tool{group.toolMessages.length > 1 ? 's' : ''}: {group.toolMessages.map(t => t.toolName).join(', ')}
                          </span>
                        </button>
                        {expandedTools.has(`tools-pending-${group.message.id}`) && (
                          <div className="mt-1 space-y-1">
                            {group.toolMessages.map((toolMsg) => (
                              <div
                                key={toolMsg.id}
                                className="rounded text-xs font-mono"
                                style={{
                                  background: 'rgba(0, 0, 0, 0.2)',
                                  border: '1px solid rgba(255, 255, 255, 0.03)'
                                }}
                              >
                                <div
                                  className="flex items-center gap-2 text-slate-500 px-2 py-1 cursor-pointer hover:text-slate-400"
                                  onClick={() => toggleToolExpanded(toolMsg.id)}
                                >
                                  {expandedTools.has(toolMsg.id) ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                  <span className="text-slate-400">{toolMsg.toolName}</span>
                                  {toolMsg.toolResult && (
                                    <span className="text-slate-600">
                                      ({toolMsg.toolResult.split('\n').length} lines)
                                    </span>
                                  )}
                                </div>
                                {expandedTools.has(toolMsg.id) && toolMsg.toolResult && (
                                  <pre className="px-2 pb-1.5 text-slate-500 whitespace-pre-wrap overflow-hidden text-[10px] border-t border-white/5 max-h-40 overflow-y-auto">
                                    {toolMsg.toolResult}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              // User message - RIGHT side with user avatar
              if (group.type === 'user') {
                // Safety check: ensure this is actually a user message
                if (group.message.role !== 'user') {
                  console.error('[AgentChat] Group type is "user" but message role is:', group.message.role)
                  return null
                }

                const message = group.message
                return (
                  <div key={message.id}>
                    <div className="flex gap-3 justify-end">
                      <div
                        className="max-w-[80%] px-4 py-3 rounded-2xl relative overflow-hidden cursor-context-menu"
                        style={{
                          background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
                          color: '#0c0f1a',
                          boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
                        }}
                        onContextMenu={(e) => handleMessageContextMenu(e, message)}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-cyan-800/60">
                          <span>{formatTimestamp(message.timestamp)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBookmark(message.id)
                            }}
                            className={`p-0.5 rounded transition-all ${
                              message.bookmarked ? 'text-amber-600' : 'text-cyan-800/40 hover:text-amber-600'
                            }`}
                            title={message.bookmarked ? 'Remove bookmark' : 'Bookmark this message'}
                          >
                            <Star className="w-3 h-3" fill={message.bookmarked ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </div>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{
                          background: userProfilePicture
                            ? 'transparent'
                            : 'linear-gradient(180deg, rgba(50, 60, 80, 0.8) 0%, rgba(35, 45, 65, 0.9) 100%)',
                          border: userProfilePicture
                            ? '2px solid rgba(236, 72, 153, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: userProfilePicture
                            ? '0 0 10px rgba(236, 72, 153, 0.2)'
                            : 'none'
                        }}
                      >
                        {userProfilePicture ? (
                          <img
                            src={userProfilePicture}
                            alt="You"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              }

              // Assistant message with optional tool blocks above - LEFT side with bot avatar
              if (group.type === 'assistant-with-tools') {
                // Safety check: ensure this is actually an assistant message
                if (group.message.role !== 'assistant') {
                  console.error('[AgentChat] Group type is "assistant-with-tools" but message role is:', group.message.role)
                  return null
                }

                const message = group.message
                const toolMessages = group.toolMessages || []

                return (
                  <div key={message.id}>
                  {/* Tool indicator - compact single line above assistant text */}
                  {toolMessages.length > 0 && (
                    <div className="mb-1 ml-12">
                      <button
                        onClick={() => {
                          // Toggle all tools in this group
                          const groupId = `tools-${message.id}`
                          if (expandedTools.has(groupId)) {
                            setExpandedTools(prev => {
                              const next = new Set(prev)
                              next.delete(groupId)
                              return next
                            })
                          } else {
                            setExpandedTools(prev => new Set([...prev, groupId]))
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-400 transition-colors"
                        style={{
                          background: 'rgba(0, 0, 0, 0.15)',
                        }}
                      >
                        {expandedTools.has(`tools-${message.id}`) ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <Terminal className="w-3 h-3" />
                        <span>
                          {toolMessages.length} tool{toolMessages.length > 1 ? 's' : ''}: {toolMessages.map(t => t.toolName).join(', ')}
                        </span>
                      </button>

                      {/* Expanded tool details */}
                      {expandedTools.has(`tools-${message.id}`) && (
                        <div className="mt-1 space-y-1">
                          {toolMessages.map((toolMsg) => (
                            <div
                              key={toolMsg.id}
                              className="rounded text-xs font-mono"
                              style={{
                                background: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.03)'
                              }}
                            >
                              <div
                                className="flex items-center gap-2 text-slate-500 px-2 py-1 cursor-pointer hover:text-slate-400"
                                onClick={() => toggleToolExpanded(toolMsg.id)}
                              >
                                {expandedTools.has(toolMsg.id) ? (
                                  <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronRight className="w-3 h-3" />
                                )}
                                <span className="text-slate-400">{toolMsg.toolName}</span>
                                {toolMsg.toolResult && (
                                  <span className="text-slate-600">
                                    ({toolMsg.toolResult.split('\n').length} lines)
                                  </span>
                                )}
                              </div>
                              {expandedTools.has(toolMsg.id) && toolMsg.toolResult && (
                                <pre className="px-2 pb-1.5 text-slate-500 whitespace-pre-wrap overflow-hidden text-[10px] border-t border-white/5 max-h-40 overflow-y-auto">
                                  {toolMsg.toolResult}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assistant text response */}
                  <div className="flex gap-3">
                    <AgentAvatar
                      avatarType={agentAvatarType}
                      customAvatar={agentCustomAvatar}
                      presetAvatar={agentPresetAvatar}
                      size="sm"
                    />
                    <div
                      className="max-w-[80%] px-4 py-3 rounded-2xl relative overflow-hidden cursor-context-menu"
                      style={{
                        background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.8) 0%, rgba(20, 28, 45, 0.9) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#e2e8f0'
                      }}
                      onContextMenu={(e) => handleMessageContextMenu(e, message)}
                    >
                      <div
                        className="absolute top-0 left-[10%] right-[10%] h-px"
                        style={{
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)'
                        }}
                      />
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                onClick={(e) => {
                                  if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('file://'))) {
                                    e.preventDefault()
                                    if (!handleLinkClick(e as unknown as React.MouseEvent, href)) {
                                      window.electronAPI?.shell.openExternal(href)
                                    }
                                  }
                                }}
                                className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                                title="Click to open, Ctrl+click for built-in browser"
                              >
                                {children}
                              </a>
                            )
                          }}
                        >{message.content}</ReactMarkdown>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        <span>{formatTimestamp(message.timestamp)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleBookmark(message.id)
                          }}
                          className={`p-0.5 rounded transition-all ${
                            message.bookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'
                          }`}
                          title={message.bookmarked ? 'Remove bookmark' : 'Bookmark this message'}
                        >
                          <Star className="w-3 h-3" fill={message.bookmarked ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
              }

              // Fallback: this should never happen - log and skip
              console.error('[AgentChat] Unhandled group type:', group.type, 'message:', group.message)
              return null
            })
          })()
        )}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.trim() === '' && !messages.some(m => m.role === 'tool') && (
          <div className="flex gap-3">
            <AgentAvatar
              avatarType={agentAvatarType}
              customAvatar={agentCustomAvatar}
              presetAvatar={agentPresetAvatar}
              size="sm"
            />
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
          {/* Slash command autocomplete dropdown */}
          {commandSuggestions.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-12 mb-2 rounded-xl overflow-hidden z-10 max-h-80 overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                boxShadow: '0 -4px 20px rgba(168, 85, 247, 0.2)'
              }}
            >
              <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-400 font-medium">Shortcuts</span>
              </div>
              {commandSuggestions.map((shortcut, index) => (
                <button
                  key={shortcut.id}
                  onClick={() => handleCommandSelect(shortcut)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    index === selectedSuggestionIndex
                      ? 'bg-purple-500/20'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <Zap className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <code className="text-sm font-medium text-purple-400">
                    /{shortcut.name}
                  </code>
                  <span className="text-slate-400 text-sm truncate flex-1">
                    {shortcut.description}
                  </span>
                </button>
              ))}
              {/* Create new shortcut button */}
              <button
                onClick={() => {
                  setCommandSuggestions([])
                  setInput('')
                  setShowCreateShortcut(true)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5 border-t border-white/5"
              >
                <span className="w-4 h-4 text-emerald-400 flex-shrink-0 flex items-center justify-center text-lg font-bold">+</span>
                <span className="text-sm font-medium text-emerald-400">Create new shortcut...</span>
              </button>
              <div className="px-4 py-1.5 text-xs text-slate-500 border-t border-white/5">
                <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400">Tab</kbd> or
                <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-400 ml-1">Enter</kbd> to expand
              </div>
            </div>
          )}

          {/* Mention autocomplete dropdown */}
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

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Listening..." : "Message your assistant (use @ for mentions, / for shortcuts)"}
              className="input-metallic w-full text-sm pr-4"
            />
            {/* Interim transcript indicator while recording */}
            {isRecording && interimTranscript && (
              <div className="absolute left-3 right-3 bottom-full mb-1 px-2 py-1 text-xs text-slate-400 bg-slate-800/90 rounded border border-white/10">
                {interimTranscript}
              </div>
            )}
          </div>

          {/* Microphone Button */}
          <button
            onClick={toggleRecording}
            disabled={!isSpeechSupported}
            className={`relative p-3 rounded-xl transition-all ${
              isRecording
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : isSpeechSupported
                  ? 'hover:bg-white/5 text-slate-400 hover:text-white border border-transparent'
                  : 'text-slate-600 cursor-not-allowed border border-transparent'
            }`}
            title={
              !isSpeechSupported
                ? 'Speech recognition not supported in this browser'
                : isRecording
                  ? 'Stop recording'
                  : 'Start voice dictation'
            }
            style={{
              boxShadow: isRecording ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none'
            }}
          >
            {isRecording ? (
              <>
                <MicOff className="w-5 h-5" />
                {/* Pulsing recording indicator */}
                <span
                  className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"
                  style={{
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)'
                  }}
                />
              </>
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="btn-primary px-4"
            data-send-button
            style={{
              opacity: input.trim() && !isLoading ? 1 : 0.5,
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed'
            }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Speech Recognition Error */}
        {speechError && (
          <div className="mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
            {speechError}
          </div>
        )}
      </div>

      {/* MCP Slideout */}
      <MCPSlideout
        isOpen={showMCPSlideout}
        onClose={() => setShowMCPSlideout(false)}
        onOpenFullConfig={handleOpenFullConfig}
      />

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      {/* Integrations Modal */}
      <IntegrationsModal isOpen={showIntegrations} onClose={handleIntegrationsClose} />

      {/* Message Context Menu */}
      {messageContextMenu && (
        <ChatMessageContextMenu
          x={messageContextMenu.x}
          y={messageContextMenu.y}
          message={messageContextMenu.message}
          onClose={() => setMessageContextMenu(null)}
          onCopyText={handleCopyMessageText}
          onCopyCode={handleCopyMessageCode}
          onResend={handleResendMessage}
          onDelete={handleDeleteMessage}
        />
      )}

      {/* Create Shortcut Dialog */}
      <CreateShortcutDialog
        isOpen={showCreateShortcut}
        onClose={() => setShowCreateShortcut(false)}
        onCreated={(_name) => {
          // Optionally focus input with the new command
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
