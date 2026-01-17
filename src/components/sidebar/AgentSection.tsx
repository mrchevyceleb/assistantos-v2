import { Plus, MoreHorizontal, Trash2, Bot, Sparkles } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAgentStore, MAX_AGENTS, type Agent, type AgentStatus } from '../../stores/agentStore'
import { useTabStore } from '../../stores/tabStore'
import { AVAILABLE_MODELS, type ModelId } from '../../stores/appStore'

// Status indicator colors
const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-emerald-400',
  working: 'bg-amber-400 animate-pulse',
  queued: 'bg-blue-400',
  error: 'bg-red-400',
}

const STATUS_RING: Record<AgentStatus, string> = {
  idle: 'ring-emerald-400/30',
  working: 'ring-amber-400/30',
  queued: 'ring-blue-400/30',
  error: 'ring-red-400/30',
}

interface AgentItemProps {
  agent: Agent
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
  onRename: (name: string) => void
  onChangeModel: (model: ModelId) => void
}

function AgentItem({
  agent,
  isActive,
  onSelect,
  onRemove,
  onRename,
  onChangeModel,
}: AgentItemProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(agent.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Focus input when renaming
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== agent.name) {
      onRename(trimmed)
    } else {
      setRenameValue(agent.name)
    }
    setIsRenaming(false)
  }

  const modelTier = AVAILABLE_MODELS.find(m => m.id === agent.model)?.tier || 'sonnet'

  return (
    <div
      className={`
        group relative flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer
        transition-all duration-150
        ${isActive
          ? 'bg-cyan-500/10 text-white'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
        }
      `}
      onClick={onSelect}
    >
      {/* Status Indicator */}
      <div className={`
        w-2 h-2 rounded-full ring-2
        ${STATUS_COLORS[agent.status]}
        ${STATUS_RING[agent.status]}
      `} />

      {/* Agent Name or Rename Input */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') {
              setRenameValue(agent.name)
              setIsRenaming(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="
            flex-1 bg-slate-800 border border-cyan-500/50 rounded px-1.5 py-0.5
            text-sm text-white outline-none focus:border-cyan-500
          "
        />
      ) : (
        <span className="flex-1 text-sm truncate">{agent.name}</span>
      )}

      {/* Model Badge */}
      <span className={`
        text-[10px] px-1.5 py-0.5 rounded uppercase font-medium
        ${modelTier === 'opus' ? 'bg-violet-500/20 text-violet-400' : ''}
        ${modelTier === 'sonnet' ? 'bg-cyan-500/20 text-cyan-400' : ''}
        ${modelTier === 'haiku' ? 'bg-emerald-500/20 text-emerald-400' : ''}
      `}>
        {modelTier}
      </span>

      {/* Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        className="
          opacity-0 group-hover:opacity-100
          p-1 rounded hover:bg-white/10 transition-opacity
        "
        aria-label="Agent options menu"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="
            absolute right-0 top-full mt-1 z-50
            bg-slate-800 border border-white/10 rounded-lg shadow-xl
            py-1 min-w-[140px]
          "
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(false)
              setIsRenaming(true)
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-white/10"
          >
            Rename
          </button>

          {/* Model Selection */}
          <div className="px-3 py-1.5 text-xs text-slate-500 border-t border-white/5 mt-1">
            Model
          </div>
          {AVAILABLE_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={(e) => {
                e.stopPropagation()
                onChangeModel(model.id)
                setShowMenu(false)
              }}
              className={`
                w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
                ${agent.model === model.id ? 'text-cyan-400' : 'text-slate-300'}
                hover:bg-white/10
              `}
            >
              <span>{model.name}</span>
              {agent.model === model.id && <Sparkles className="w-3 h-3" />}
            </button>
          ))}

          <div className="border-t border-white/5 mt-1" />

          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(false)
              onRemove()
            }}
            className="
              w-full px-3 py-1.5 text-left text-sm text-red-400
              hover:bg-red-500/10 flex items-center gap-2
            "
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export function AgentSection() {
  const agents = useAgentStore(state => state.agents)
  const activeAgentId = useAgentStore(state => state.activeAgentId)
  const createAgent = useAgentStore(state => state.createAgent)
  const removeAgent = useAgentStore(state => state.removeAgent)
  const setActiveAgent = useAgentStore(state => state.setActiveAgent)
  const updateAgentName = useAgentStore(state => state.updateAgentName)
  const updateAgentModel = useAgentStore(state => state.updateAgentModel)
  const canCreate = useAgentStore(state => state.canCreateAgent())

  const openOrFocusAgent = useTabStore(state => state.openOrFocusAgent)
  const closeAgentTab = useTabStore(state => state.closeAgentTab)

  const handleSelectAgent = (agent: Agent) => {
    setActiveAgent(agent.id)
    openOrFocusAgent(agent.id, agent.name)
  }

  const handleCreateAgent = () => {
    const newId = createAgent()
    if (newId) {
      const newAgent = useAgentStore.getState().getAgent(newId)
      if (newAgent) {
        openOrFocusAgent(newId, newAgent.name)
      }
    }
  }

  const handleRemoveAgent = (agentId: string) => {
    closeAgentTab(agentId)
    removeAgent(agentId)
  }

  return (
    <div className="py-3 flex-shrink-0">
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Agents
          </span>
          <span className="text-xs text-slate-600">
            {agents.length}/{MAX_AGENTS}
          </span>
        </div>

        <button
          onClick={handleCreateAgent}
          disabled={!canCreate}
          className={`
            p-1 rounded transition-colors
            ${canCreate
              ? 'text-slate-400 hover:text-white hover:bg-white/10'
              : 'text-slate-600 cursor-not-allowed'
            }
          `}
          title={canCreate ? 'New Agent (Ctrl+T)' : `Maximum ${MAX_AGENTS} agents`}
          aria-label={canCreate ? 'Create new agent' : `Maximum ${MAX_AGENTS} agents reached`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Agent List */}
      <div className="space-y-0.5">
        {agents.map((agent) => (
          <AgentItem
            key={agent.id}
            agent={agent}
            isActive={agent.id === activeAgentId}
            onSelect={() => handleSelectAgent(agent)}
            onRemove={() => handleRemoveAgent(agent.id)}
            onRename={(name) => updateAgentName(agent.id, name)}
            onChangeModel={(model) => updateAgentModel(agent.id, model)}
          />
        ))}
      </div>
    </div>
  )
}
