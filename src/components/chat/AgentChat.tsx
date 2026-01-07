import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Settings2, Sparkles } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function AgentChat() {
  const { apiKey, setApiKey } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: apiKey
          ? 'Claude integration coming soon! Your API key is configured.'
          : 'Please configure your Anthropic API key in settings to chat with Claude.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
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

      {/* Settings Panel */}
      {showSettings && (
        <div
          className="p-4 relative"
          style={{
            background: 'linear-gradient(180deg, rgba(25, 32, 50, 0.8) 0%, rgba(15, 20, 35, 0.9) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
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
              Your personal AI assistant. Ask questions, get help with tasks, or just chat.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
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
                className={`max-w-[80%] px-4 py-3 rounded-2xl relative overflow-hidden ${
                  message.role === 'user' ? '' : ''
                }`}
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
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
          ))
        )}
        {isLoading && (
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
