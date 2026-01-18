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
import { Send, X, Bot, User, Settings2, Sparkles, Terminal, ChevronDown, ChevronRight, Trash2, Brain, Mic, MicOff, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { LinkifiedText } from './LinkifiedText'

// Stores
import { useAppStore, AVAILABLE_MODELS, type ModelId } from '../../stores/appStore'
import { useAgentStore, type Message } from '../../stores/agentStore'
import { useTabStore } from '../../stores/tabStore'

// Hooks
import { useChatAutosave } from '../../hooks/useChatAutosave'
import { useVoiceDictation } from './hooks/useVoiceDictation'
import { ChatMessage, setAgentConversationId } from '../../services/chatHistory/chatHistoryService'

// Services
import { ClaudeService, ImageContent } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt, type EnabledIntegration } from '../../services/systemPrompt'
import { getToolsForMessage, markToolUsed, clearAgentTools } from '../../services/intent/toolLoadingManager'
import { extractIntegrationId } from '../../services/intent/heuristicMatcher'
import {
  parseMessage,
  getUnifiedSuggestions,
  getPartialMention,
  completeMention,
  type UnifiedSuggestion,
  type DocumentMention
} from '../../services/mentions/parser'
import { getPartialCommand, getCommandSuggestions, completeCommand, expandSlashCommand } from '../../services/shortcuts/parser'
import { loadAllSkills } from '../../services/shortcuts/skillLoader'
import { PromptShortcut } from '../../types/shortcut'
import { generateChatTitle } from '../../services/titleGenerator'
import {
  getContextUsage,
  formatTokenCount,
  getContextUsageColor,
  shouldCompact,
  type ContextUsage
} from '../../services/tokenService'

// Chat utilities
import {
  type AttachedImage,
  fileToAttachedImage,
  clipboardToAttachedImage,
  readDocumentContext,
  sanitizeMCPTools,
  prepareAllEnabledTools
} from './utils/chatUtils'

// Components
import { SettingsModal } from '../settings/SettingsModal'

interface AgentChatContainerProps {
  agentId: string
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
  const gmailAccounts = useAppStore(state => state.gmailAccounts)
  const memoryEnabled = useAppStore(state => state.memoryEnabled)
  const getAllShortcuts = useAppStore(state => state.getAllShortcuts)
  const setLoadedSkills = useAppStore(state => state.setLoadedSkills)
  const kanbanSettings = useAppStore(state => state.kanbanSettings)  // [Bug Fix] Added for custom tasks folder
  const showContextUsage = useAppStore(state => state.showContextUsage)
  const pendingChatInput = useAppStore(state => state.pendingChatInput)
  const setPendingChatInput = useAppStore(state => state.setPendingChatInput)

  // Chat font size
  const chatFontSize = useAppStore(state => state.chatFontSize)
  const increaseChatFontSize = useAppStore(state => state.increaseChatFontSize)
  const decreaseChatFontSize = useAppStore(state => state.decreaseChatFontSize)
  const setChatFontSize = useAppStore(state => state.setChatFontSize)

  // Agent store (per-agent state)
  const agent = useAgentStore(state => state.getAgent(agentId))
  const addMessage = useAgentStore(state => state.addMessage)
  const insertMessageBefore = useAgentStore(state => state.insertMessageBefore)
  const updateMessage = useAgentStore(state => state.updateMessage)
  const clearMessages = useAgentStore(state => state.clearMessages)
  const updateAgentStatus = useAgentStore(state => state.updateAgentStatus)
  const updateAgentName = useAgentStore(state => state.updateAgentName)
  const updateAgentModel = useAgentStore(state => state.updateAgentModel)
  const setAgentConversationIdStore = useAgentStore(state => state.setAgentConversationId)

  // Tab store
  const updateTab = useTabStore(state => state.updateTab)
  const activeTab = useTabStore(state => state.getActiveTab())

  // Local UI state
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isInterrupting, setIsInterrupting] = useState(false)
  const [isToolExecuting, setIsToolExecuting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const partialResponseRef = useRef<string>('') // Track partial AI response for interrupts
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [mentionSuggestions, setMentionSuggestions] = useState<UnifiedSuggestion[]>([])
  const [commandSuggestions, setCommandSuggestions] = useState<PromptShortcut[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [activeDocuments, setActiveDocuments] = useState<DocumentMention[]>([])

  // Helper function to show notifications (placeholder - integrate with app notification system)
  const addNotification = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    // TODO: Integrate with app notification system if available
    void { title, message, type }
  }, [])

  // Voice dictation hook
  const {
    isRecording,
    interimTranscript,
    toggleVoiceRecording
  } = useVoiceDictation({
    input,
    setInput,
    addNotification
  })

  // Esc+Esc tracking for stopping AI response
  const lastEscPressRef = useRef<number>(0)

  // Global Esc+Esc keyboard listener for stopping AI response
  // Works even when textarea is not focused - enables stopping from anywhere in the chat panel
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle Escape when agent is loading
      if (e.key !== 'Escape' || !isLoading) return

      const now = Date.now()
      const timeSinceLastEsc = now - lastEscPressRef.current

      if (timeSinceLastEsc < 500) {
        // Double Esc detected (within 500ms) - stop response
        e.preventDefault()
        e.stopPropagation()

        // Abort the current request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }

        // Reset loading state
        setIsLoading(false)
        setIsInterrupting(false)
        partialResponseRef.current = ''

        // Update agent status
        updateAgentStatus(agentId, 'idle')

        // Reset timer
        lastEscPressRef.current = 0

        console.log('[AgentChat] Response stopped via Esc+Esc keyboard shortcut')
      } else {
        // First Esc - record time
        lastEscPressRef.current = now
      }
    }

    // Add global listener
    document.addEventListener('keydown', handleGlobalKeyDown)

    // Cleanup on unmount or when dependencies change
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [isLoading, agentId, updateAgentStatus])

  // Chat zoom keyboard shortcuts (Ctrl+Plus/Minus/0)
  useEffect(() => {
    const handleZoomKeyDown = (e: KeyboardEvent) => {
      // Only handle Ctrl/Cmd + Plus/Minus/0
      if (!e.ctrlKey && !e.metaKey) return

      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        e.stopPropagation()
        increaseChatFontSize()
      } else if (e.key === '-') {
        e.preventDefault()
        e.stopPropagation()
        decreaseChatFontSize()
      } else if (e.key === '0') {
        e.preventDefault()
        e.stopPropagation()
        setChatFontSize(14) // Reset to default 14px
      }
    }

    document.addEventListener('keydown', handleZoomKeyDown)
    return () => document.removeEventListener('keydown', handleZoomKeyDown)
  }, [increaseChatFontSize, decreaseChatFontSize, setChatFontSize])

  // Auto-open HTML files in browser when agent creates them
  useEffect(() => {
    const handleHtmlPreview = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string }>
      const filePath = customEvent.detail.path
      // Convert to file:// URL with forward slashes
      const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
      // Open in browser tab using tab store
      useTabStore.getState().openOrFocusBrowser(fileUrl)
    }

    window.addEventListener('open-html-preview', handleHtmlPreview)
    return () => window.removeEventListener('open-html-preview', handleHtmlPreview)
  }, [])

  // Context usage tracking
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [showContextTooltip, setShowContextTooltip] = useState(false)
  const [lastSystemPrompt, setLastSystemPrompt] = useState('')
  const [lastTools, setLastTools] = useState<any[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get messages from agent
  const messages = agent?.messages || []
  const agentModel = agent?.model || 'claude-sonnet-4-20250514'

  // Convert messages to ChatMessage format for autosave
  const chatMessages: ChatMessage[] = messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    toolName: m.toolName,
    toolResult: m.toolResult,
    bookmarked: m.bookmarked,
  }))

  // Autosave hook - automatically saves conversations as the user chats
  const { resetConversation, setConversationId } = useChatAutosave(chatMessages, {
    enabled: true,
    agentId,
    agentName: agent?.name || 'New Chat',
    modelId: agentModel,
    workspacePath,
    debounceDelay: 2000,
    onSaveComplete: (result) => {
      if (result.success && result.conversationId) {
        // Update agent store with conversation ID
        setAgentConversationIdStore(agentId, result.conversationId)
        // Also update the chat history service mapping
        setAgentConversationId(agentId, result.conversationId)
      }
    },
  })

  // Sync conversation ID if agent already has one (loaded from history)
  useEffect(() => {
    if (agent?.conversationId) {
      setConversationId(agent.conversationId)
    }
  }, [agent?.conversationId, setConversationId])

  // Initialize Claude service for this agent
  useEffect(() => {
    if (apiKey && agent) {
      claudeServiceRef.current = new ClaudeService(apiKey, agent.model, maxTokens)
    } else {
      claudeServiceRef.current = null
    }
  }, [apiKey, agent?.model, maxTokens])

  // Load skills from ~/.claude/skills and ~/.claude/commands on mount
  useEffect(() => {
    loadAllSkills().then(skills => {
      setLoadedSkills(skills)
    }).catch(err => {
      console.error('[Skills] Error loading skills:', err)
    })
  }, [setLoadedSkills])

  // Get combined shortcuts (user shortcuts + loaded skills)
  const shortcuts = getAllShortcuts()

  // Handle pending chat input from file tree "Send to Chat"
  useEffect(() => {
    if (pendingChatInput !== null) {
      setInput(pendingChatInput)
      setPendingChatInput(null)
      // Focus the textarea after a short delay to ensure render
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 50)
    }
  }, [pendingChatInput, setPendingChatInput])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize context usage tracking (calculate system prompt + tools once)
  useEffect(() => {
    const initializeContextUsage = async () => {
      if (!showContextUsage) return

      try {
        // Build enabled integrations list for system prompt
        // For context usage initialization, we just need basic info
        const enabledIntegrations = Object.entries(integrationConfigs)
          .filter(([, config]) => config.enabled)
          .map(([id]) => ({ id, name: id, description: `Integration ${id}` }))

        // Assemble system prompt
        const systemPrompt = await assembleSystemPrompt(
          workspacePath,
          openFiles,
          currentFile,
          customInstructions,
          enabledIntegrations,
          null, // No memory context for initial calculation
          kanbanSettings.customTasksFolder
        )

        // Prepare tools
        const tools = await prepareAllEnabledTools(integrationConfigs)

        setLastSystemPrompt(systemPrompt)
        setLastTools(tools)
      } catch (error) {
        console.error('[AgentChatContainer] Error initializing context usage:', error)
      }
    }

    initializeContextUsage()
  }, [showContextUsage, workspacePath, openFiles, currentFile, customInstructions, integrationConfigs, kanbanSettings.customTasksFolder])

  // Calculate context usage when messages change
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
      agentModel
    )
    setContextUsage(usage)
  }, [messages, lastSystemPrompt, lastTools, agentModel, showContextUsage])

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
    // Reset autosave state for new conversation
    resetConversation()
    // Clear loaded tools to reset context
    clearAgentTools(agentId)
    // Reset active mentions and documents
    setActiveMentions([])
    setActiveDocuments([])
    // Reset context usage cache to properly reflect empty state
    setLastSystemPrompt('')
    setLastTools([])
  }

  // Handle input change with mention and slash command detection
  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    // Check for slash commands first
    const partialCommand = getPartialCommand(value)
    if (partialCommand) {
      const suggestions = getCommandSuggestions(partialCommand, shortcuts)
      setCommandSuggestions(suggestions)
      setMentionSuggestions([])
      setSelectedSuggestionIndex(0)
      return
    } else {
      setCommandSuggestions([])
    }

    // Parse mentions
    const { mentions, documentMentions } = await parseMessage(value, workspacePath)
    setActiveMentions(mentions)
    setActiveDocuments(documentMentions)

    // Get mention suggestions
    const partialMention = getPartialMention(value)
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

    const mentionText = suggestion.type === 'integration' ? suggestion.mention : suggestion.mention
    const newInput = completeMention(input, mentionText)
    setInput(newInput)
    setMentionSuggestions([])

    // Re-parse mentions
    parseMessage(newInput, workspacePath).then(({ mentions, documentMentions }) => {
      setActiveMentions(mentions)
      setActiveDocuments(documentMentions)
    })
  }

  // Handle command suggestion selection
  const selectCommandSuggestion = (shortcut: PromptShortcut) => {
    const newInput = completeCommand(input, shortcut)
    setInput(newInput)
    setCommandSuggestions([])
    setSelectedSuggestionIndex(0)
    textareaRef.current?.focus()
  }

  // Handle clipboard paste for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    // Strategy 1: Check clipboard items (works for most browsers)
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))

    // Strategy 2: Check clipboard files (works for Windows Snipping Tool, Print Screen)
    const files = Array.from(e.clipboardData.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i))

    const hasImages = imageItems.length > 0 || imageFiles.length > 0

    if (!hasImages) {
      return // Let default paste behavior handle text
    }

    e.preventDefault() // Prevent pasting image as text/filename
    setStatusMessage('Processing image...')

    const newImages: AttachedImage[] = []
    let failedCount = 0

    try {
      // Process clipboard items first (inline image data)
      for (const item of imageItems) {
        try {
          const image = await clipboardToAttachedImage(item)
          if (image) {
            newImages.push(image)
          } else {
            failedCount++
          }
        } catch (err) {
          console.error('[Paste] Error processing clipboard item:', err)
          failedCount++
        }
      }

      // Process files if items didn't work (Windows fallback)
      if (newImages.length === 0 && imageFiles.length > 0) {
        for (const file of imageFiles) {
          try {
            const image = await fileToAttachedImage(file)
            if (image) {
              newImages.push(image)
            } else {
              failedCount++
            }
          } catch (err) {
            console.error('[Paste] Error processing file:', err)
            failedCount++
          }
        }
      }

      // Update state and notify user
      if (newImages.length > 0) {
        setAttachedImages(prev => [...prev, ...newImages])

        // Success notification
        addNotification(
          'Images Attached',
          `${newImages.length} image${newImages.length > 1 ? 's' : ''} ready to send`,
          'success'
        )

        // Focus input after paste
        textareaRef.current?.focus()
      }

      // Warning notification if some failed
      if (failedCount > 0) {
        addNotification(
          'Partial Paste Failure',
          `${failedCount} image${failedCount > 1 ? 's' : ''} could not be processed.`,
          'warning'
        )
      }

      // Error notification if all failed
      if (newImages.length === 0 && (imageItems.length > 0 || imageFiles.length > 0)) {
        addNotification(
          'Paste Failed',
          'Could not process clipboard images. Try drag & drop or the file picker instead.',
          'error'
        )
      }
    } catch (err) {
      console.error('[Paste] Critical error in paste handler:', err)
      addNotification(
        'Paste Error',
        'An unexpected error occurred while pasting images.',
        'error'
      )
    } finally {
      setStatusMessage(null)
    }
  }

  // Stop AI response - abort the request and keep partial response
  const stopResponse = useCallback(() => {
    if (!isLoading) return

    // Abort the current request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setIsLoading(false)
    setIsInterrupting(false)
    updateAgentStatus(agentId, 'idle')
    partialResponseRef.current = ''

    // The partial response remains visible as-is
    addNotification(
      'Response Stopped',
      'AI response stopped.',
      'info'
    )
  }, [isLoading, agentId, updateAgentStatus, addNotification])

  // Interrupt current AI response and restart with new user message (Claude Code style)
  const interruptAndRestart = async (newMessage: string, _imagesToSend: AttachedImage[]) => {
    if (!isLoading || isInterrupting) return

    setIsInterrupting(true)

    try {
      // Abort the current request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      // Salvage partial response (let it stand as-is, no interruption marker)
      // The partial response will remain visible and the new user message will follow naturally

      // Clear state and prepare for new message
      setInput('')
      setAttachedImages([])
      setMentionSuggestions([])
      setActiveMentions([])
      setActiveDocuments([])
      setIsLoading(false)
      if (isToolExecuting) {
        setIsToolExecuting(false)
      }
      partialResponseRef.current = ''

      // Brief delay for state to settle
      await new Promise(resolve => setTimeout(resolve, 100))

      // Send new message (conversation naturally continues)
      setInput(newMessage)
      await new Promise(resolve => setTimeout(resolve, 30))
      // Call handleSendMessage with skipInterruptCheck=true to avoid loop
      await handleSendMessage(true)

    } catch (err) {
      console.error('[Chat] Error during interrupt redirect:', err)
      addNotification(
        'Redirect Failed',
        'Could not send new message. Please try again.',
        'error'
      )
      setIsLoading(false)
    } finally {
      setIsInterrupting(false)
    }
  }

  // Send message handler
  const handleSendMessage = async (skipInterruptCheck = false) => {
    if (!input.trim() && attachedImages.length === 0) return
    if (!claudeServiceRef.current || !agent) return

    // INTERRUPT LOGIC: If AI is currently responding, interrupt it and restart with new context
    if (!skipInterruptCheck && isLoading && !isInterrupting) {
      await interruptAndRestart(input.trim(), attachedImages)
      return
    }

    // Expand slash commands before sending
    const expandedInput = expandSlashCommand(input.trim(), shortcuts)

    // Handle image-only messages: provide default prompt if no text
    const hasImages = attachedImages.length > 0
    const userInput = expandedInput || (hasImages ? 'Please analyze this image.' : '')

    // Convert AttachedImage[] to ImageContent[] for Claude API
    const imagesToSend: ImageContent[] = hasImages
      ? attachedImages.map(img => ({
          type: 'base64' as const,
          mediaType: img.mediaType,
          data: img.data,
        }))
      : []

    const isFirstMessage = messages.length === 0

    // Create user message (include image count in display and store images for rendering)
    const displayContent = hasImages && !expandedInput.trim()
      ? `[${attachedImages.length} image${attachedImages.length > 1 ? 's' : ''} attached]`
      : hasImages
        ? `${userInput}\n\n[${attachedImages.length} image${attachedImages.length > 1 ? 's' : ''} attached]`
        : userInput
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      images: hasImages ? attachedImages.map(img => ({
        preview: img.preview,
        mediaType: img.mediaType
      })) : undefined
    }

    addMessage(agentId, userMessage)
    setInput('')
    setAttachedImages([]) // Clear attached images after sending
    setIsLoading(true)
    updateAgentStatus(agentId, 'working')

    try {
      // Generate title from first message
      if (isFirstMessage) {
        setStatusMessage('Generating title...')
        generateChatTitle(userInput, apiKey).then(title => {
          updateAgentName(agentId, title)
          if (activeTab?.type === 'agent' && activeTab.agentId === agentId) {
            updateTab(activeTab.id, { title })
          }
        }).catch(console.error).finally(() => {
          // Clear status only if it's still the title generation message
          setStatusMessage(prev => prev === 'Generating title...' ? null : prev)
        })
      }

      // Read document context
      setStatusMessage('Preparing context...')
      const documentContext = await readDocumentContext(activeDocuments)
      const messageWithContext = userInput + documentContext

      // Merge Gmail accounts into integration configs for tool loading
      // Gmail accounts are stored separately but need to be included in enabledIds
      const mergedConfigs = { ...integrationConfigs }
      for (const account of gmailAccounts) {
        if (account.enabled) {
          mergedConfigs[account.integrationId] = { enabled: true, envVars: {} }
        }
      }

      // Intelligent tool loading: detect intent and load tools dynamically
      setStatusMessage('Loading tools...')
      const { tools: rawTools, loadedIntegrations: loadedIntegrationIds } = await getToolsForMessage(
        agent.id,
        userInput,
        messages,
        mergedConfigs,
        apiKey,
        allTools
      )

      // Sanitize tool names to comply with Anthropic API requirements
      const { tools, nameMap } = sanitizeMCPTools(rawTools)

      // Fetch metadata for loaded integrations (for system prompt)
      let loadedIntegrations: EnabledIntegration[] = []
      if (loadedIntegrationIds.length > 0) {
        try {
          const allIntegrations = await window.electronAPI.mcp.getIntegrations()
          loadedIntegrations = allIntegrations
            .filter((int: any) => loadedIntegrationIds.includes(int.id))
            .map((int: any) => ({
              id: int.id,
              name: int.name,
              description: int.description
            }))
        } catch (e) {
          console.error('[MCP] Failed to fetch integration metadata:', e)
        }
      }

      // Assemble full system prompt with LOADED integrations
      const systemPrompt = await assembleSystemPrompt(
        workspacePath,
        openFiles,
        currentFile,
        customInstructions,
        loadedIntegrations, // ← Synchronized with loaded tools
        null, // memory context
        kanbanSettings.customTasksFolder
      )

      // Create tool executor with agent context and usage tracking
      // Translate sanitized names back to original names for MCP execution
      const baseToolExecutor = createToolExecutor(workspacePath || '', agentId, agent.name)
      const toolExecutor = async (name: string, input: Record<string, unknown>) => {
        // Check if this is a sanitized name that needs translation
        const originalName = nameMap.get(name) || name

        const integrationId = extractIntegrationId(originalName)
        if (integrationId) {
          markToolUsed(agent.id, integrationId)
        }

        try {
          return await baseToolExecutor(originalName, input)
        } catch (error) {
          console.error(`[Tool] Failed: ${originalName}`, error)
          throw error
        }
      }

      // Clear status message as we're about to start streaming
      setStatusMessage('Thinking...')

      // Create assistant message placeholder with "Thinking..." content
      // This will be replaced by actual streaming content as it arrives
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: 'Thinking...',
        timestamp: new Date(),
      }
      addMessage(agentId, assistantMessage)

      // Create abort controller for this request
      abortControllerRef.current = new AbortController()
      const abortSignal = abortControllerRef.current.signal

      // Stream response with optional images
      let firstChunkReceived = false
      for await (const chunk of claudeServiceRef.current.chat(
        messageWithContext,
        tools,
        systemPrompt,
        toolExecutor,
        abortSignal,
        imagesToSend.length > 0 ? imagesToSend : undefined
      )) {
        // Handle abort early exit
        if (chunk.type === 'aborted') {
          // Keep partial response visible, just stop processing
          const currentContent = useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || ''
          if (currentContent === 'Thinking...') {
            // No content yet, update with stopped message
            updateMessage(agentId, assistantMessage.id, {
              content: '[Response stopped by user]',
            })
          }
          // Status already updated by stopResponse()
          break
        }

        if (chunk.type === 'text') {
          const currentContent = useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || ''

          // Replace "Thinking..." with first actual content
          const newContent = (!firstChunkReceived && currentContent === 'Thinking...')
            ? (chunk.text || '')
            : currentContent + (chunk.text || '')

          firstChunkReceived = true
          // Clear status message when first content arrives
          setStatusMessage(null)
          updateMessage(agentId, assistantMessage.id, {
            content: newContent,
          })
          // Track partial response for interrupt support
          partialResponseRef.current = newContent
        } else if (chunk.type === 'iteration_boundary') {
          // Add paragraph break between agentic loop iterations
          const currentContent = useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || ''
          if (currentContent && !currentContent.endsWith('\n\n')) {
            updateMessage(agentId, assistantMessage.id, {
              content: currentContent + '\n\n',
            })
          }
        } else if (chunk.type === 'tool_use' && chunk.toolName && chunk.toolInput) {
          // Only handle tool_use chunks that have full input data
          // (The streaming API emits an early chunk without toolInput which we skip)
          // Show status for tool execution
          setStatusMessage(`Running ${chunk.toolName}...`)
          // Insert tool message BEFORE the assistant message so grouping works correctly
          // Tools should appear above the assistant's text response in the UI
          const toolMessage: Message = {
            id: `msg-${Date.now()}-tool-${chunk.toolName}`,
            role: 'tool',
            content: `Using tool: ${chunk.toolName}`,
            timestamp: new Date(),
            toolName: chunk.toolName,
          }
          insertMessageBefore(agentId, toolMessage, assistantMessage.id)
        } else if (chunk.type === 'tool_result') {
          // Update tool message with result
          const toolMessages = useAgentStore.getState().getAgent(agentId)?.messages.filter(m => m.role === 'tool') || []
          const lastToolMsg = toolMessages[toolMessages.length - 1]
          if (lastToolMsg) {
            updateMessage(agentId, lastToolMsg.id, {
              toolResult: typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result),
            })
          }
          // Clear tool status, go back to thinking
          setStatusMessage('Thinking...')
        } else if (chunk.type === 'error') {
          setStatusMessage(null)
          updateMessage(agentId, assistantMessage.id, {
            content: (useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || '') + `\n\nError: ${chunk.error}`,
          })
        } else if (chunk.type === 'iteration_limit') {
          // Hit the iteration limit - show a helpful message
          setStatusMessage(null)
          const currentContent = useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || ''
          updateMessage(agentId, assistantMessage.id, {
            content: currentContent + `\n\n---\n\n**Paused after ${chunk.iterationsCompleted} iterations.** ${chunk.error}`,
          })
        }
      }

      setStatusMessage(null)
      updateAgentStatus(agentId, 'idle')
    } catch (error) {
      console.error('Chat error:', error)
      setStatusMessage(null) // Clear status on error
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
      setStatusMessage(null) // Ensure status is cleared
      abortControllerRef.current = null // Clear abort controller
      partialResponseRef.current = '' // Clear partial response tracking
    }
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc+Esc: Stop AI response (no redirect, just stop)
    if (e.key === 'Escape' && isLoading) {
      const now = Date.now()
      const timeSinceLastEsc = now - lastEscPressRef.current

      if (timeSinceLastEsc < 500) {
        // Double Esc detected (within 500ms)
        e.preventDefault()
        stopResponse()
        lastEscPressRef.current = 0 // Reset
        return
      } else {
        // First Esc - record time
        lastEscPressRef.current = now
        // Don't prevent default - let it close suggestions
      }
    }

    // Handle command suggestions navigation
    if (commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => (prev + 1) % commandSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev === 0 ? commandSuggestions.length - 1 : prev - 1)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        selectCommandSuggestion(commandSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        setCommandSuggestions([])
        return
      }
    }

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
        {showSettingsModal && <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-900/50">
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
            type="button"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dynamic chat font size styles */}
      <style>{`
        .chat-messages .prose {
          font-size: ${chatFontSize}px !important;
          line-height: 1.6;
        }
        .chat-messages .prose h1 {
          font-size: ${Math.round(chatFontSize * 2)}px !important;
        }
        .chat-messages .prose h2 {
          font-size: ${Math.round(chatFontSize * 1.5)}px !important;
        }
        .chat-messages .prose h3 {
          font-size: ${Math.round(chatFontSize * 1.25)}px !important;
        }
        .chat-messages .prose code {
          font-size: ${Math.round(chatFontSize * 0.9)}px !important;
        }
        .chat-messages .prose pre {
          font-size: ${Math.round(chatFontSize * 0.85)}px !important;
        }
      `}</style>

      {/* Messages */}
      <div className="chat-messages flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-10 h-10 text-cyan-400/50 mb-4" />
            <p className="text-slate-400">Start a conversation with your AI assistant</p>
            <p className="text-xs text-slate-500 mt-2">
              Use @mentions to reference files or integrations
            </p>
          </div>
        ) : (
          // Group messages: tool messages should appear above their associated assistant response
          (() => {
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
                pendingTools.push(msg)
              } else if (msg.role === 'assistant') {
                groups.push({
                  type: 'assistant-with-tools',
                  message: msg,
                  toolMessages: pendingTools.length > 0 ? [...pendingTools] : undefined
                })
                pendingTools = []
              } else if (msg.role === 'user') {
                // Flush orphaned tools as tools-pending (should render on LEFT, not RIGHT)
                if (pendingTools.length > 0) {
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
            // Handle trailing tools (during streaming)
            if (pendingTools.length > 0) {
              groups.push({
                type: 'tools-pending',
                message: pendingTools[0],
                toolMessages: [...pendingTools]
              })
            }

            return groups.map((group) => {
              // Tools pending (during streaming) - render on LEFT with bot avatar
              if (group.type === 'tools-pending' && group.toolMessages) {
                return (
                  <div key={`pending-${group.message.id}`} className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-cyan-500/20">
                      <Bot className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <div className="space-y-1">
                        {group.toolMessages.map((toolMsg) => (
                          <div
                            key={toolMsg.id}
                            className="rounded-lg text-xs font-mono cursor-pointer select-none bg-slate-800/50 border border-white/5"
                            onClick={() => toggleToolExpanded(toolMsg.id)}
                          >
                            <div className="flex items-center gap-2 text-slate-400 px-3 py-1.5 hover:text-slate-300 transition-colors">
                              {expandedTools.has(toolMsg.id) ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <Terminal className="w-3 h-3 text-violet-400" />
                              <span className="text-violet-400">{toolMsg.toolName}</span>
                              {toolMsg.toolResult && !expandedTools.has(toolMsg.id) && (
                                <span className="text-slate-500 ml-1">
                                  {toolMsg.toolResult.split('\n').length > 1
                                    ? `(${toolMsg.toolResult.split('\n').length} lines)`
                                    : ''}
                                </span>
                              )}
                            </div>
                            {expandedTools.has(toolMsg.id) && toolMsg.toolResult && (
                              <pre
                                className="px-3 pb-2 text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto border-t border-white/5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {toolMsg.toolResult}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              }

              // User messages - render on RIGHT with user avatar
              if (group.type === 'user' && group.message.role === 'user') {
                const message = group.message
                return (
                  <div key={message.id} className="flex gap-3 justify-end">
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-cyan-500/20 text-white">
                      {/* Render attached images */}
                      {message.images && message.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {message.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img.preview}
                              alt={`Attached image ${idx + 1}`}
                              className="max-w-[200px] max-h-[200px] rounded-lg object-contain border border-white/10"
                            />
                          ))}
                        </div>
                      )}
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            code: ({ children }) => {
                              if (typeof children !== 'string') return <code>{children}</code>
                              return <LinkifiedText text={children} />
                            },
                            text: ({ children }) => {
                              if (typeof children !== 'string') return <>{children}</>
                              return <LinkifiedText text={children} />
                            }
                          }}
                        >{message.content}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                )
              }

              const message = group.message
              const toolMessages = group.toolMessages || []

              return (
                <div key={message.id}>
                  {/* Tool blocks - rendered ABOVE assistant text, collapsed by default */}
                  {toolMessages.length > 0 && (
                    <div className="mb-2 space-y-1 ml-10">
                      {toolMessages.map((toolMsg) => (
                        <div
                          key={toolMsg.id}
                          className="rounded-lg text-xs font-mono cursor-pointer select-none bg-slate-800/50 border border-white/5"
                          onClick={() => toggleToolExpanded(toolMsg.id)}
                        >
                          <div className="flex items-center gap-2 text-slate-400 px-3 py-1.5 hover:text-slate-300 transition-colors">
                            {expandedTools.has(toolMsg.id) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <Terminal className="w-3 h-3 text-violet-400" />
                            <span className="text-violet-400">{toolMsg.toolName}</span>
                            {toolMsg.toolResult && !expandedTools.has(toolMsg.id) && (
                              <span className="text-slate-500 ml-1">
                                {toolMsg.toolResult.split('\n').length > 1
                                  ? `(${toolMsg.toolResult.split('\n').length} lines)`
                                  : ''}
                              </span>
                            )}
                          </div>
                          {expandedTools.has(toolMsg.id) && toolMsg.toolResult && (
                            <pre
                              className="px-3 pb-2 text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto border-t border-white/5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {toolMsg.toolResult}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assistant text response */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-cyan-500/20">
                      <Bot className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="max-w-[80%] rounded-lg px-4 py-2 bg-slate-800/50">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            code: ({ children }) => {
                              if (typeof children !== 'string') return <code>{children}</code>
                              return <LinkifiedText text={children} />
                            },
                            text: ({ children }) => {
                              if (typeof children !== 'string') return <>{children}</>
                              return <LinkifiedText text={children} />
                            }
                          }}
                        >{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          })()
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-white/5 p-4">
        {/* Command Suggestions (Slash Commands) */}
        {commandSuggestions.length > 0 && (
          <div className="mb-2 bg-slate-800 border border-white/10 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            {commandSuggestions.map((shortcut, index) => (
              <button
                key={shortcut.name}
                className={`
                  w-full px-3 py-2 text-left text-sm flex items-center gap-2
                  ${index === selectedSuggestionIndex ? 'bg-cyan-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}
                `}
                onClick={() => selectCommandSuggestion(shortcut)}
              >
                <span className="text-cyan-400 font-mono">/{shortcut.name}</span>
                <span className="text-slate-500 text-xs truncate">{shortcut.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mention Suggestions */}
        {mentionSuggestions.length > 0 && (
          <div className="mb-2 bg-slate-800 border border-white/10 rounded-lg overflow-hidden">
            {mentionSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.type === 'integration' ? suggestion.integrationId : suggestion.path}
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

        {/* Image Previews */}
        {attachedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedImages.map(image => (
              <div
                key={image.id}
                className="relative group rounded-lg overflow-hidden border border-white/10 bg-slate-800/50"
                style={{ width: '80px', height: '80px' }}
              >
                <img
                  src={image.preview}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setAttachedImages(prev => prev.filter(img => img.id !== image.id))}
                  className="
                    absolute top-1 right-1
                    p-1 rounded-full
                    bg-red-500/80 hover:bg-red-600
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                  "
                  title="Remove image"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <div className="
                  absolute bottom-0 left-0 right-0
                  px-1 py-0.5
                  bg-black/60 text-white text-[10px] truncate
                ">
                  {image.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Voice Recording Indicator */}
        {isRecording && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-sm font-medium">Recording...</span>
            </div>
            {interimTranscript && (
              <span className="text-slate-400 text-sm italic flex-1 truncate">
                "{interimTranscript}"
              </span>
            )}
          </div>
        )}

        {/* Status Indicator */}
        {statusMessage && (
          <div className="flex items-center gap-2 px-2 py-1 text-sm text-cyan-400">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="animate-pulse">{statusMessage}</span>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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

          {/* Microphone Button */}
          <button
            onClick={toggleVoiceRecording}
            disabled={isLoading}
            title={isRecording ? 'Stop recording' : 'Start voice dictation'}
            className={`
              px-4 py-3 rounded-lg
              text-white transition-all
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-slate-700 hover:bg-slate-600 border border-white/10'
              }
              disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed
            `}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Stop Button (when loading) / Send Button (when idle) */}
          {isLoading ? (
            <button
              onClick={stopResponse}
              disabled={isInterrupting}
              title="Stop response (or press Esc twice)"
              className={`
                px-4 py-3 rounded-lg
                text-white transition-all
                bg-red-500 hover:bg-red-600
                border border-red-400/30
                shadow-lg shadow-red-500/20
                disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
              `}
            >
              <Square className="w-5 h-5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() && attachedImages.length === 0}
              title="Send message"
              className={`
                px-4 py-3 rounded-lg
                text-white transition-all
                bg-cyan-500 hover:bg-cyan-600
                disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
              `}
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />}
    </div>
  )
}
