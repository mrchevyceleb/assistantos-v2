import { useState, useRef, useEffect } from 'react'
import { Plus, Bot, Globe, LayoutDashboard, CheckSquare, Zap } from 'lucide-react'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'

interface MenuItem {
  id: string
  icon: React.ReactNode
  label: string
  shortcut?: string
  disabled?: boolean
  disabledReason?: string
  onClick: () => void
}

export function AddTabButton() {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Stores
  const createAgent = useAgentStore(state => state.createAgent)
  const canCreateAgent = useAgentStore(state => state.canCreateAgent())
  const openOrFocusAgent = useTabStore(state => state.openOrFocusAgent)
  const openOrFocusBrowser = useTabStore(state => state.openOrFocusBrowser)
  const openOrFocusDashboard = useTabStore(state => state.openOrFocusDashboard)
  const openOrFocusTasks = useTabStore(state => state.openOrFocusTasks)
  const openOrFocusLudicrous = useTabStore(state => state.openOrFocusLudicrous)

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Keyboard shortcut for new agent
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        handleNewAgent()
      }
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        openOrFocusLudicrous()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleNewAgent = () => {
    const newId = createAgent()
    if (newId) {
      const newAgent = useAgentStore.getState().getAgent(newId)
      if (newAgent) {
        openOrFocusAgent(newId, newAgent.name)
      }
    }
    setShowMenu(false)
  }

  const menuItems: MenuItem[] = [
    {
      id: 'new-agent',
      icon: <Bot className="w-4 h-4" />,
      label: 'New Agent',
      shortcut: 'Ctrl+T',
      disabled: !canCreateAgent,
      disabledReason: 'Maximum 5 agents',
      onClick: handleNewAgent,
    },
    {
      id: 'browser',
      icon: <Globe className="w-4 h-4" />,
      label: 'Browser',
      onClick: () => {
        openOrFocusBrowser()
        setShowMenu(false)
      },
    },
    {
      id: 'dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      label: 'Dashboard',
      onClick: () => {
        openOrFocusDashboard()
        setShowMenu(false)
      },
    },
    {
      id: 'tasks',
      icon: <CheckSquare className="w-4 h-4" />,
      label: 'Tasks',
      onClick: () => {
        openOrFocusTasks()
        setShowMenu(false)
      },
    },
    {
      id: 'ludicrous',
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      label: 'LUDICROUS MODE',
      shortcut: 'Ctrl+L',
      onClick: () => {
        openOrFocusLudicrous()
        setShowMenu(false)
      },
    },
  ]

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowMenu(!showMenu)}
        className="
          flex items-center justify-center
          w-10 h-10
          text-slate-400 hover:text-white
          hover:bg-white/5 transition-colors
          border-l border-white/5
        "
        title="New Tab"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="
            absolute right-0 top-full mt-1 z-50
            bg-slate-800 border border-white/10 rounded-lg shadow-xl
            py-1 min-w-[180px]
          "
        >
          {menuItems.map((item) => (
            <div key={item.id}>
              {/* Separator before LUDICROUS MODE */}
              {item.id === 'ludicrous' && (
                <div className="border-t border-white/5 my-1" />
              )}

              <button
                onClick={item.onClick}
                disabled={item.disabled}
                className={`
                  w-full px-3 py-2 text-left text-sm
                  flex items-center justify-between gap-2
                  ${item.disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }
                `}
                title={item.disabled ? item.disabledReason : undefined}
              >
                <div className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </div>

                {item.shortcut && (
                  <span className="text-xs text-slate-500">{item.shortcut}</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
