import { useState, useEffect } from 'react'
import { Mail, Clock, Settings, RefreshCw, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'

interface EmailMessage {
  id: string
  account: string
  from: string
  subject: string
  snippet: string
  date: string
  isUnread: boolean
}

// AccountSummary interface for future multi-account display
// interface AccountSummary {
//   email: string
//   unreadCount: number
//   isConnected: boolean
// }

export function EmailWidget() {
  const { gmailAccounts } = useAppStore()
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if any Gmail accounts are configured
  const hasAccounts = gmailAccounts.length > 0
  const enabledAccounts = gmailAccounts.filter(acc => acc.enabled)
  const isConfigured = enabledAccounts.length > 0

  useEffect(() => {
    if (isConfigured) {
      fetchEmails()
    }
  }, [isConfigured])

  const fetchEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      // Try to use the unified-gmail-mcp tools
      // First, get the first enabled account's integration ID
      const firstAccount = enabledAccounts[0]
      if (!firstAccount) {
        setError('No enabled Gmail accounts')
        return
      }

      // Check if MCP is ready for this account
      const isReady = await window.electronAPI?.mcp.isReady(firstAccount.integrationId)
      if (!isReady) {
        // Try to start the MCP server
        try {
          await window.electronAPI?.mcp.start(firstAccount.integrationId)
        } catch (startErr) {
          console.error('[EmailWidget] Failed to start MCP:', startErr)
          setError('Gmail not connected')
          return
        }
      }

      // List available tools to see what we can actually call
      const availableTools = await window.electronAPI?.mcp.getTools([firstAccount.integrationId])

      // Find the search/list messages tool
      const searchTool = availableTools?.find((t: any) =>
        t.name?.includes('search') && t.name?.includes('email')
      )

      // Try to get recent messages using the discovered tool
      if (!searchTool) {
        setError('No email search tool available')
        return
      }

      // Get recent unread messages
      const messagesResult = await window.electronAPI?.mcp.executeTool(
        firstAccount.integrationId,
        searchTool.name,
        {
          query: 'in:inbox is:unread',
          maxResults: 5
        }
      )

      if (messagesResult?.success && messagesResult.result) {
        try {
          // MCP returns: [{ type: "text", text: "..." }]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let messagesData: any = messagesResult.result

          // Extract text from MCP format
          if (Array.isArray(messagesData) && messagesData[0]?.type === 'text') {
            const textContent = messagesData[0]?.text || ''

            if (!textContent || !textContent.trim()) {
              // Empty result - inbox zero!
              setMessages([])
              return
            }

            try {
              messagesData = JSON.parse(textContent)
            } catch (parseErr) {
              console.error('[EmailWidget] Failed to parse email text:', parseErr)
              setMessages([])
              return
            }
          }

          // Helper function to extract header value
          const getHeader = (msg: any, headerName: string): string => {
            if (msg.payload?.headers) {
              const header = msg.payload.headers.find((h: any) =>
                h.name?.toLowerCase() === headerName.toLowerCase()
              )
              return header?.value || ''
            }
            return ''
          }

          // Helper function to format message
          const formatMessage = (msg: any): EmailMessage => {
            // Try multiple ways to get the 'from' field
            let from = msg.from || getHeader(msg, 'From')
            if (!from || from === '') {
              from = 'Unknown Sender'
            }

            // Try multiple ways to get the 'subject' field
            let subject = msg.subject || getHeader(msg, 'Subject') || '(No subject)'

            // Try to get date - could be in multiple formats
            let date = msg.date || msg.internalDate
            if (!date && msg.payload?.headers) {
              date = getHeader(msg, 'Date')
            }
            if (!date) {
              date = new Date().toISOString()
            }

            return {
              id: msg.id || msg.messageId || Math.random().toString(),
              account: msg.account || firstAccount.email,
              from,
              subject,
              snippet: msg.snippet || msg.body?.substring(0, 100) || '',
              date,
              isUnread: msg.labelIds?.includes('UNREAD') ?? true
            }
          }

          if (Array.isArray(messagesData)) {
            const formatted = messagesData.slice(0, 5).map(formatMessage)
            setMessages(formatted)
          } else if (messagesData.messages && Array.isArray(messagesData.messages)) {
            const formatted = messagesData.messages.slice(0, 5).map(formatMessage)
            setMessages(formatted)
          }
        } catch (parseErr) {
          console.error('[EmailWidget] Failed to parse messages:', parseErr)
        }
      }
    } catch (err) {
      console.error('[EmailWidget] Error fetching emails:', err)
      setError('Failed to fetch emails')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) {
      return 'Just now'
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const formatFrom = (from: string) => {
    // Extract name from "Name <email>" format
    const match = from.match(/^(.+?)\s*</)
    if (match) {
      return match[1].trim().replace(/"/g, '')
    }
    // If it's just an email, show the part before @
    const emailMatch = from.match(/^([^@]+)@/)
    if (emailMatch) {
      return emailMatch[1]
    }
    return from.substring(0, 20)
  }

  // Not configured state
  if (!hasAccounts) {
    return (
      <WidgetContainer title="Email" icon={<Mail className="w-4 h-4" />}>
        <div className="text-center py-6">
          <Mail className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-3">No Gmail accounts</p>
          <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mx-auto">
            <Settings className="w-3 h-3" />
            Add in Integrations
          </button>
        </div>
      </WidgetContainer>
    )
  }

  // Has accounts but none enabled
  if (!isConfigured) {
    return (
      <WidgetContainer title="Email" icon={<Mail className="w-4 h-4" />}>
        <div className="text-center py-6">
          <Mail className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-3">Gmail disabled</p>
          <p className="text-xs text-slate-500">Enable in Integrations to see emails</p>
        </div>
      </WidgetContainer>
    )
  }

  return (
    <WidgetContainer
      title="Email"
      icon={<Mail className="w-4 h-4" />}
      loading={loading}
      onRefresh={fetchEmails}
      skeletonRows={5}
    >
      {error ? (
        <div className="text-center py-4">
          <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={fetchEmails}
            className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mx-auto"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-4">
          <Mail className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Inbox zero!</p>
          <p className="text-xs text-slate-500 mt-1">No unread emails</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {messages.map((email) => (
            <div
              key={email.id}
              className="p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group"
            >
              <div className="flex items-start gap-2">
                {/* Unread indicator */}
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  email.isUnread ? 'bg-cyan-400' : 'bg-transparent'
                }`} />

                <div className="flex-1 min-w-0">
                  {/* From and Date */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate ${
                      email.isUnread ? 'text-slate-200 font-medium' : 'text-slate-400'
                    }`}>
                      {formatFrom(email.from)}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDate(email.date)}
                    </span>
                  </div>

                  {/* Subject */}
                  <p className={`text-xs truncate mt-0.5 ${
                    email.isUnread ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {email.subject}
                  </p>

                  {/* Snippet */}
                  <p className="text-[10px] text-slate-600 truncate mt-0.5 group-hover:text-slate-500">
                    {email.snippet}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetContainer>
  )
}
