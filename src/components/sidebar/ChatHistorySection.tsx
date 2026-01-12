import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, Trash2, Clock, ExternalLink } from 'lucide-react'
import { ConversationMeta } from '@/services/conversationStorage'
import {
  listConversations,
  deleteConversation,
  formatHistoryDate,
  groupConversationsByDate,
} from '@/services/chatHistory/chatHistoryService'

interface ChatHistorySectionProps {
  /** Called when a conversation should be loaded */
  onLoadConversation: (conversationId: string) => void
  /** Currently active conversation ID (for highlighting) */
  activeConversationId?: string | null
}

export function ChatHistorySection({
  onLoadConversation,
  activeConversationId,
}: ChatHistorySectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load conversations on mount and when section expands
  const loadConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await listConversations()
      setConversations(list)
    } catch (error) {
      console.error('[ChatHistory] Failed to load conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load when expanded
  useEffect(() => {
    if (!isCollapsed) {
      loadConversations()
    }
  }, [isCollapsed, loadConversations])

  // Refresh periodically when expanded (every 30 seconds)
  useEffect(() => {
    if (isCollapsed) return

    const interval = setInterval(loadConversations, 30000)
    return () => clearInterval(interval)
  }, [isCollapsed, loadConversations])

  // Handle delete
  const handleDelete = useCallback(async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    const confirmed = true // In production, you might want a confirmation dialog
    if (confirmed) {
      const success = await deleteConversation(conversationId)
      if (success) {
        setConversations(prev => prev.filter(c => c.id !== conversationId))
      }
    }
  }, [])

  // Group conversations by date
  const groupedConversations = groupConversationsByDate(conversations)
  const groupOrder = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older']

  return (
    <div className="border-b border-white/5 flex-shrink-0">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="
          w-full flex items-center justify-between px-4 py-3
          text-slate-400 hover:text-white transition-colors cursor-pointer
        "
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <MessageSquare className="w-4 h-4 text-cyan-500" />
          <span className="text-xs font-medium uppercase tracking-wider">Chat History</span>
          {conversations.length > 0 && (
            <span className="text-xs text-slate-500">
              ({conversations.length})
            </span>
          )}
        </div>
      </div>

      {/* History Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3">
          {isLoading && conversations.length === 0 ? (
            <div className="text-xs text-slate-500 py-2 px-1 animate-pulse">
              Loading conversations...
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-slate-500 py-2 px-1">
              No saved conversations yet.
              <br />
              <span className="text-slate-600">Chats are auto-saved as you talk.</span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {groupOrder.map(groupName => {
                const group = groupedConversations.get(groupName)
                if (!group || group.length === 0) return null

                return (
                  <div key={groupName}>
                    {/* Group Header */}
                    <div className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-1.5 px-1">
                      {groupName}
                    </div>

                    {/* Conversations in Group */}
                    <div className="space-y-1">
                      {group.map(conv => (
                        <div
                          key={conv.id}
                          onClick={() => onLoadConversation(conv.id)}
                          className={`
                            group relative
                            rounded px-2 py-1.5
                            cursor-pointer transition-colors
                            ${conv.id === activeConversationId
                              ? 'bg-cyan-500/10 border border-cyan-500/30'
                              : 'bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50'
                            }
                          `}
                        >
                          {/* Title */}
                          <p className={`
                            text-xs pr-5 truncate
                            ${conv.id === activeConversationId ? 'text-cyan-400' : 'text-slate-300'}
                          `}>
                            {conv.title}
                          </p>

                          {/* Preview */}
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {conv.preview}
                          </p>

                          {/* Metadata */}
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-600">
                            <Clock className="w-3 h-3" />
                            <span>{formatHistoryDate(conv.updatedAt)}</span>
                            <span className="text-slate-700">|</span>
                            <span>{conv.messageCount} msgs</span>
                          </div>

                          {/* Actions */}
                          <div className="
                            absolute top-1 right-1
                            flex items-center gap-0.5
                            opacity-0 group-hover:opacity-100
                            transition-opacity
                          ">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onLoadConversation(conv.id)
                              }}
                              className="
                                p-0.5 rounded
                                text-slate-600 hover:text-cyan-400
                                transition-colors
                              "
                              title="Open in new tab"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, conv.id)}
                              className="
                                p-0.5 rounded
                                text-slate-600 hover:text-red-400
                                transition-colors
                              "
                              title="Delete conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
