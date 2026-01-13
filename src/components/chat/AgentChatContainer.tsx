/**
 * Agent Chat Container
 *
 * Wraps chat functionality for a specific agent from the agent store.
 * Each agent gets its own isolated chat session with:
 * - Independent ClaudeService instance
 * - Messages stored in agent store
 * - Per-agent model selection
 */

import { useState, useRef, useEffect } from 'react'
import { Send, Square, X, Bot, User, Settings2, Sparkles, Terminal, ChevronDown, ChevronRight, Trash2, Brain, Mic, MicOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { LinkifiedText } from './LinkifiedText'

// Stores
import { useAppStore, AVAILABLE_MODELS, type ModelId } from '../../stores/appStore'
import { useAgentStore, type Message } from '../../stores/agentStore'
import { useTabStore } from '../../stores/tabStore'

// Hooks
import { useChatAutosave } from '../../hooks/useChatAutosave'
import { ChatMessage, setAgentConversationId } from '../../services/chatHistory/chatHistoryService'

// Services
import { ClaudeService } from '../../services/claude'
import { allTools, createToolExecutor } from '../../services/tools'
import { assembleSystemPrompt, type EnabledIntegration } from '../../services/systemPrompt'
import { getCachedMCPTools } from '../../services/toolCache'
import { getToolsForMessage, markToolUsed } from '../../services/intent/toolLoadingManager'
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
import { PromptShortcut } from '../../types/shortcut'
import { generateChatTitle } from '../../services/titleGenerator'
import {
  getContextUsage,
  formatTokenCount,
  getContextUsageColor,
  shouldCompact,
  type ContextUsage
} from '../../services/tokenService'

// Components
import { SettingsModal } from '../settings/SettingsModal'

interface AgentChatContainerProps {
  agentId: string
}

/**
 * AttachedImage type for image attachments
 */
interface AttachedImage {
  id: string
  data: string // base64 encoded (without data URL prefix)
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  preview: string // data URL for preview display
  name: string
}

/**
 * Convert a File to AttachedImage format
 */
async function fileToAttachedImage(file: File): Promise<AttachedImage | null> {
  console.log('[fileToAttachedImage] Processing:', file.name, file.type, file.size)

  // Validate file type (be lenient for Windows clipboard)
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
  const isValidMime = validTypes.includes(file.type)
  const hasImageExtension = /\.(png|jpe?g|gif|webp)$/i.test(file.name)

  if (!isValidMime && !hasImageExtension) {
    console.warn('[fileToAttachedImage] Unsupported image type:', file.type, file.name)
    return null
  }

  // Infer media type if mime type is missing (Windows clipboard edge case)
  let mediaType = file.type as AttachedImage['mediaType']
  if (!mediaType || mediaType === 'application/octet-stream') {
    const ext = file.name.match(/\.(png|jpe?g|gif|webp)$/i)?.[1]?.toLowerCase()
    if (ext === 'png') mediaType = 'image/png'
    else if (ext === 'jpg' || ext === 'jpeg') mediaType = 'image/jpeg'
    else if (ext === 'gif') mediaType = 'image/gif'
    else if (ext === 'webp') mediaType = 'image/webp'
    else mediaType = 'image/png' // default fallback
    console.log('[fileToAttachedImage] Inferred media type:', mediaType)
  }

  // Size validation (max 10MB to prevent memory issues)
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    console.warn('[fileToAttachedImage] File too large:', file.size, 'bytes')
    return null
  }

  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const dataUrl = e.target?.result as string
        if (!dataUrl) {
          console.error('[fileToAttachedImage] No data URL generated')
          resolve(null)
          return
        }

        // Extract base64 data (remove "data:image/png;base64," prefix)
        const base64Data = dataUrl.split(',')[1]

        if (!base64Data) {
          console.error('[fileToAttachedImage] Failed to extract base64 data')
          resolve(null)
          return
        }

        const image: AttachedImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          data: base64Data,
          mediaType,
          preview: dataUrl,
          name: file.name || 'pasted-image.png'
        }

        console.log('[fileToAttachedImage] Success:', image.name, 'size:', base64Data.length)
        resolve(image)
      } catch (err) {
        console.error('[fileToAttachedImage] Error in onload:', err)
        resolve(null)
      }
    }

    reader.onerror = (err) => {
      console.error('[fileToAttachedImage] FileReader error:', err)
      resolve(null)
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Convert clipboard data to AttachedImage
 */
async function clipboardToAttachedImage(item: DataTransferItem): Promise<AttachedImage | null> {
  const file = item.getAsFile()
  if (!file) return null
  return fileToAttachedImage(file)
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
 * Sanitize tool names to comply with Anthropic API requirements
 * Pattern: ^[a-zA-Z0-9_-]{1,128}$
 * Replaces @ and . with underscores for Gmail tools (e.g., gmail_user@gmail.com → gmail_user_gmail_com)
 */
function sanitizeToolName(toolName: string): string {
  return toolName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 128)
}

/**
 * Sanitize MCP tools to ensure names comply with API requirements
 * Handles both tool.name and tool.custom.name formats
 * Returns both sanitized tools and a mapping for reverse lookup during execution
 */
function sanitizeMCPTools(tools: any[]): { tools: any[], nameMap: Map<string, string> } {
  const nameMap = new Map<string, string>()

  const sanitizedTools = tools.map(tool => {
    // Check tool.name (standard format)
    if (tool.name && !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.name)) {
      const originalName = tool.name
      const sanitizedName = sanitizeToolName(tool.name)
      nameMap.set(sanitizedName, originalName)
      console.log(`[Tool Sanitizer] Renamed tool.name: ${originalName} → ${sanitizedName}`)
      return { ...tool, name: sanitizedName }
    }

    // Check tool.custom.name (MCP custom tool format)
    if (tool.custom?.name && !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.custom.name)) {
      const originalName = tool.custom.name
      const sanitizedName = sanitizeToolName(tool.custom.name)
      nameMap.set(sanitizedName, originalName)
      console.log(`[Tool Sanitizer] Renamed tool.custom.name: ${originalName} → ${sanitizedName}`)
      return {
        ...tool,
        custom: { ...tool.custom, name: sanitizedName }
      }
    }

    return tool
  })

  return { tools: sanitizedTools, nameMap }
}

/**
 * Prepare tools for a message - SELECTIVE loading based on @mentions
 * Only loads MCP tools when that integration is @mentioned
 */
async function prepareToolsForMessage(
  message: string,
  integrationConfigs: Record<string, { enabled: boolean; envVars: Record<string, string> }>,
  workspacePath: string | null = null
) {
  // Always include core tools
  const tools = [...allTools]

  // Parse @mentions from message
  const { mentions: mentionedIntegrationIds } = await parseMessage(message, workspacePath)

  // Filter to only enabled integrations that were @mentioned
  const enabledMentionedIds = mentionedIntegrationIds.filter(id =>
    integrationConfigs[id]?.enabled
  )

  if (enabledMentionedIds.length === 0) {
    return tools
  }

  try {
    const mcpTools = await getCachedMCPTools(enabledMentionedIds)
    const { tools: sanitizedTools } = sanitizeMCPTools(mcpTools)
    console.log(`[AgentChatContainer] Loaded ${sanitizedTools.length} tools for @mentioned integrations: ${enabledMentionedIds.join(', ')}`)
    return [...tools, ...sanitizedTools]
  } catch (e) {
    console.error('Failed to load MCP tools:', e)
    return tools
  }
}

/**
 * Prepare ALL enabled tools for context usage calculation
 * Unlike prepareToolsForMessage, this loads all enabled integrations regardless of @mentions
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
    const { tools: sanitizedTools } = sanitizeMCPTools(mcpTools)
    return [...allTools, ...sanitizedTools]
  } catch (e) {
    console.error('[AgentChatContainer] Failed to load MCP tools for context calculation:', e)
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
  const gmailAccounts = useAppStore(state => state.gmailAccounts)
  const memoryEnabled = useAppStore(state => state.memoryEnabled)
  const shortcuts = useAppStore(state => state.shortcuts)
  const kanbanSettings = useAppStore(state => state.kanbanSettings)  // [Bug Fix] Added for custom tasks folder
  const showContextUsage = useAppStore(state => state.showContextUsage)

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
  const partialResponseRef = useRef<string>('') // Track partial AI response for interrupts
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [mentionSuggestions, setMentionSuggestions] = useState<UnifiedSuggestion[]>([])
  const [commandSuggestions, setCommandSuggestions] = useState<PromptShortcut[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [activeDocuments, setActiveDocuments] = useState<DocumentMention[]>([])

  // Voice dictation state
  const [isRecording, setIsRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  const recordingStartInputRef = useRef<string>('') // Store input when recording starts
  const isRecordingRef = useRef<boolean>(false) // Ref for onend handler to avoid stale closure

  // Esc+Esc tracking for stopping AI response
  const lastEscPressRef = useRef<number>(0)

  // Context usage tracking
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [showContextTooltip, setShowContextTooltip] = useState(false)
  const [lastSystemPrompt, setLastSystemPrompt] = useState('')
  const [lastTools, setLastTools] = useState<any[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const claudeServiceRef = useRef<ClaudeService | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Helper function to show notifications
  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    // Simple console notification for now (can be extended with a proper notification system)
    console.log(`[${type.toUpperCase()}] ${title}: ${message}`)
    // TODO: Integrate with app notification system if available
  }

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
        console.log('[AgentChat] Autosaved conversation:', result.conversationId)
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

  // Initialize Web Speech API (ONCE - no dependencies to avoid recreation)
  useEffect(() => {
    console.log('[Bug-Hunter] Initializing Web Speech API')

    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('[Bug-Hunter] Web Speech API not supported in this browser')
      return
    }

    // Create recognition instance
    const recognition = new SpeechRecognition()
    recognition.continuous = true // Keep listening until stopped
    recognition.interimResults = true // Get partial results while speaking
    recognition.lang = 'en-US' // Default to English

    console.log('[Bug-Hunter] Recognition instance created:', {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang
    })

    // Handle start event
    recognition.onstart = () => {
      console.log('[Bug-Hunter] Recognition STARTED - now listening for speech')
    }

    // Handle results
    recognition.onresult = (event: any) => {
      console.log('[Bug-Hunter] onresult fired! Event:', {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
        results: Array.from(event.results).map((r: any) => ({
          transcript: r[0].transcript,
          isFinal: r.isFinal,
          confidence: r[0].confidence
        }))
      })

      let interimText = ''
      let finalText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript + ' '
          console.log('[Bug-Hunter] Final text captured:', transcript)
        } else {
          interimText += transcript
          console.log('[Bug-Hunter] Interim text captured:', transcript)
        }
      }

      // Update interim transcript for visual feedback
      setInterimTranscript(interimText)

      // Append final results to input
      if (finalText) {
        console.log('[Bug-Hunter] Appending final text to input:', finalText)
        setInput(prevInput => {
          const baseInput = recordingStartInputRef.current
          const currentFinalText = prevInput.slice(baseInput.length).trim()
          const newFinalText = (currentFinalText + ' ' + finalText).trim()
          const result = baseInput + (baseInput && newFinalText ? ' ' : '') + newFinalText
          console.log('[Bug-Hunter] Input updated:', { prevInput, baseInput, newFinalText, result })
          return result
        })
        setInterimTranscript('')
      }
    }

    // Handle errors
    recognition.onerror = (event: any) => {
      console.error('[Bug-Hunter] Speech recognition error:', event.error, event)

      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        addNotification(
          'Microphone Permission Denied',
          'Please grant microphone access to use voice dictation',
          'error'
        )
      } else if (event.error === 'no-speech') {
        console.warn('[Bug-Hunter] No speech detected - but this is normal, not stopping recording')
        // Don't stop recording on no-speech - let user decide when to stop
        return
      } else if (event.error === 'network') {
        addNotification(
          'Network Error',
          'Voice recognition requires an internet connection',
          'error'
        )
      } else {
        addNotification(
          'Voice Recognition Error',
          `An error occurred: ${event.error}`,
          'error'
        )
      }

      setIsRecording(false)
      isRecordingRef.current = false
      setInterimTranscript('')
    }

    // Handle end of recognition
    recognition.onend = () => {
      console.log('[Bug-Hunter] Recognition ended. isRecordingRef.current:', isRecordingRef.current)

      // Use ref instead of state to avoid stale closure
      if (isRecordingRef.current) {
        console.log('[Bug-Hunter] Still recording, restarting recognition...')
        try {
          recognition.start()
          console.log('[Bug-Hunter] Recognition restarted successfully')
        } catch (e) {
          console.log('[Bug-Hunter] Recognition already started or error:', e)
        }
      } else {
        console.log('[Bug-Hunter] Recording stopped, not restarting')
      }
    }

    recognitionRef.current = recognition
    console.log('[Bug-Hunter] Recognition instance stored in ref')

    // Cleanup
    return () => {
      console.log('[Bug-Hunter] Cleanup: stopping recognition')
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, []) // EMPTY DEPS - only initialize once

  // Start voice recording
  const startVoiceRecording = async () => {
    console.log('[Bug-Hunter] startVoiceRecording called')

    if (!recognitionRef.current) {
      console.error('[Bug-Hunter] No recognition instance available')
      addNotification(
        'Voice Input Not Supported',
        'Your browser does not support voice input. Try Chrome or Edge.',
        'error'
      )
      return
    }

    try {
      // Store current input so we can append to it
      recordingStartInputRef.current = input
      console.log('[Bug-Hunter] Stored base input:', input)

      // Set BOTH state and ref (ref for onend handler)
      setIsRecording(true)
      isRecordingRef.current = true
      setInterimTranscript('')

      console.log('[Bug-Hunter] Calling recognition.start()...')
      recognitionRef.current.start()
      console.log('[Bug-Hunter] recognition.start() called successfully')

      addNotification(
        'Voice Recording Started',
        'Speak your message. Click the microphone again to stop.',
        'info'
      )
    } catch (error) {
      console.error('[Bug-Hunter] Error starting recognition:', error)
      addNotification(
        'Recording Failed',
        'Could not start voice recording. Please try again.',
        'error'
      )
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }

  // Stop voice recording
  const stopVoiceRecording = () => {
    console.log('[Bug-Hunter] stopVoiceRecording called')

    if (recognitionRef.current) {
      console.log('[Bug-Hunter] Calling recognition.stop()...')
      recognitionRef.current.stop()
    }

    // Set BOTH state and ref
    setIsRecording(false)
    isRecordingRef.current = false
    setInterimTranscript('')

    console.log('[Bug-Hunter] Recording stopped')

    addNotification(
      'Voice Recording Stopped',
      'Your message has been transcribed.',
      'success'
    )
  }

  // Toggle voice recording
  const toggleVoiceRecording = () => {
    if (isRecording) {
      stopVoiceRecording()
    } else {
      startVoiceRecording()
    }
  }

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
    console.log('[Paste] Clipboard event triggered')
    console.log('[Paste] Items:', Array.from(e.clipboardData.items).map(i => ({ type: i.type, kind: i.kind })))
    console.log('[Paste] Files:', Array.from(e.clipboardData.files).map(f => ({ name: f.name, type: f.type, size: f.size })))

    // Strategy 1: Check clipboard items (works for most browsers)
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))

    // Strategy 2: Check clipboard files (works for Windows Snipping Tool, Print Screen)
    const files = Array.from(e.clipboardData.files)
    const imageFiles = files.filter(file => file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i))

    const hasImages = imageItems.length > 0 || imageFiles.length > 0

    if (!hasImages) {
      console.log('[Paste] No images detected in clipboard')
      return // Let default paste behavior handle text
    }

    e.preventDefault() // Prevent pasting image as text/filename
    console.log('[Paste] Processing images:', { itemCount: imageItems.length, fileCount: imageFiles.length })

    const newImages: AttachedImage[] = []
    let failedCount = 0

    try {
      // Process clipboard items first (inline image data)
      for (const item of imageItems) {
        try {
          console.log('[Paste] Processing item:', item.type)
          const image = await clipboardToAttachedImage(item)
          if (image) {
            newImages.push(image)
            console.log('[Paste] Item processed successfully:', image.name)
          } else {
            console.warn('[Paste] Item returned null:', item.type)
            failedCount++
          }
        } catch (err) {
          console.error('[Paste] Error processing clipboard item:', err)
          failedCount++
        }
      }

      // Process files if items didn't work (Windows fallback)
      if (newImages.length === 0 && imageFiles.length > 0) {
        console.log('[Paste] Falling back to file-based paste')
        for (const file of imageFiles) {
          try {
            console.log('[Paste] Processing file:', file.name, file.type)
            const image = await fileToAttachedImage(file)
            if (image) {
              newImages.push(image)
              console.log('[Paste] File processed successfully:', image.name)
            } else {
              console.warn('[Paste] File returned null:', file.name)
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
        console.log('[Paste] Successfully attached images:', newImages.length)

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
          `${failedCount} image${failedCount > 1 ? 's' : ''} could not be processed. Check console for details.`,
          'warning'
        )
      }

      // Error notification if all failed
      if (newImages.length === 0 && (imageItems.length > 0 || imageFiles.length > 0)) {
        console.error('[Paste] All images failed to process')
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
    }
  }

  // Stop AI response (Esc+Esc) - just stop, no new message
  const stopResponse = () => {
    if (!isLoading) return

    console.log('[Stop] User stopped AI response with Esc+Esc')
    setIsLoading(false)
    setIsInterrupting(false)
    partialResponseRef.current = ''

    // The partial response remains visible as-is
    addNotification(
      'Response Stopped',
      'AI response stopped.',
      'info'
    )
  }

  // Interrupt current AI response and restart with new user message (Claude Code style)
  const interruptAndRestart = async (newMessage: string, imagesToSend: AttachedImage[]) => {
    if (!isLoading || isInterrupting) return

    console.log('[Interrupt] User sending new message during AI response')
    setIsInterrupting(true)

    try {
      // Step 1: Salvage partial response (let it stand as-is, no interruption marker)
      const partialResponse = partialResponseRef.current || ''
      console.log('[Interrupt] Salvaged partial response:', partialResponse.substring(0, 100))

      // Step 2: Just keep the partial response as-is (no "[Interrupted...]" marker)
      // The partial response will remain visible and the new user message will follow naturally

      // Step 3: Clear state and prepare for new message
      setInput('')
      setAttachedImages([])
      setMentionSuggestions([])
      setActiveMentions([])
      setActiveDocuments([])
      setIsLoading(false)
      if (isToolExecuting) {
        console.warn('[Interrupt] Redirecting during tool execution')
        setIsToolExecuting(false)
      }
      partialResponseRef.current = ''

      // Step 4: Brief delay for state to settle
      await new Promise(resolve => setTimeout(resolve, 100))

      // Step 5: Send new message (conversation naturally continues)
      console.log('[Interrupt] Sending new message:', newMessage.substring(0, 50))
      setInput(newMessage)
      await new Promise(resolve => setTimeout(resolve, 30))
      // Call handleSendMessage with skipInterruptCheck=true to avoid loop
      await handleSendMessage(true)

    } catch (err) {
      console.error('[Interrupt] Error during redirect:', err)
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
      console.log('[Interrupt] User sent message during AI response - triggering interrupt')
      await interruptAndRestart(input.trim(), attachedImages)
      return
    }

    // Expand slash commands before sending
    const expandedInput = expandSlashCommand(input.trim(), shortcuts)
    const userInput = expandedInput
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

      // Merge Gmail accounts into integration configs for tool loading
      // Gmail accounts are stored separately but need to be included in enabledIds
      const mergedConfigs = { ...integrationConfigs }
      for (const account of gmailAccounts) {
        if (account.enabled) {
          mergedConfigs[account.integrationId] = { enabled: true, envVars: {} }
        }
      }

      // Intelligent tool loading: detect intent and load tools dynamically
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
          console.log(`[AgentChatContainer] Loaded integrations for agent ${agent.id}:`, loadedIntegrationIds)
        } catch (e) {
          console.error('Failed to fetch integration metadata:', e)
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
        if (originalName !== name) {
          console.log(`[Tool Executor] Translating: ${name} → ${originalName}`)
        }

        console.log(`[Tool Executor] Executing tool: ${originalName}`, {
          sanitizedName: name,
          originalName,
          input,
          wasTranslated: originalName !== name
        })

        const integrationId = extractIntegrationId(originalName)
        if (integrationId) {
          console.log(`[Tool Executor] Extracted integrationId: ${integrationId}`)
          markToolUsed(agent.id, integrationId)
        } else {
          console.log(`[Tool Executor] No integrationId extracted from: ${originalName}`)
        }

        try {
          const result = await baseToolExecutor(originalName, input)
          console.log(`[Tool Executor] SUCCESS for ${originalName}`, result)
          return result
        } catch (error) {
          console.error(`[Tool Executor] FAILED for ${originalName}`, error)
          throw error
        }
      }

      // Create assistant message placeholder with "Thinking..." content
      // This will be replaced by actual streaming content as it arrives
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: 'Thinking...',
        timestamp: new Date(),
      }
      addMessage(agentId, assistantMessage)

      // Stream response
      let firstChunkReceived = false
      for await (const chunk of claudeServiceRef.current.chat(
        messageWithContext,
        tools,
        systemPrompt,
        toolExecutor
      )) {
        if (chunk.type === 'text') {
          const currentContent = useAgentStore.getState().getAgent(agentId)?.messages.find(m => m.id === assistantMessage.id)?.content || ''

          // Replace "Thinking..." with first actual content
          const newContent = (!firstChunkReceived && currentContent === 'Thinking...')
            ? (chunk.text || '')
            : currentContent + (chunk.text || '')

          firstChunkReceived = true
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
            onClick={() => {
              console.log('Settings button clicked')
              setShowSettingsModal(true)
            }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Settings"
            type="button"
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

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={isLoading ? isInterrupting : (!input.trim() && attachedImages.length === 0)}
            title={isLoading ? 'Send new message (or press Esc+Esc to stop)' : 'Send message'}
            className={`
              px-4 py-3 rounded-lg
              text-white transition-all
              ${isLoading
                ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
                : 'bg-cyan-500 hover:bg-cyan-600'
              }
              disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
            `}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />}
    </div>
  )
}
