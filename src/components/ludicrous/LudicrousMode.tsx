/**
 * LUDICROUS MODE
 *
 * Grid view showing all active agents simultaneously.
 * Perfect for power users who want to monitor and interact
 * with multiple agents at once.
 */

import { Zap, Bot } from 'lucide-react'
import { useAgentStore, MAX_AGENTS } from '../../stores/agentStore'
import { useTabStore } from '../../stores/tabStore'
import { LudicrousModeCard } from './LudicrousModeCard'

export function LudicrousMode() {
  const agents = useAgentStore(state => state.agents)
  const createAgent = useAgentStore(state => state.createAgent)
  const canCreate = useAgentStore(state => state.canCreateAgent())
  const openOrFocusAgent = useTabStore(state => state.openOrFocusAgent)

  // Calculate grid columns based on agent count
  const getGridCols = () => {
    if (agents.length <= 1) return 'grid-cols-1'
    if (agents.length <= 2) return 'grid-cols-1 md:grid-cols-2'
    if (agents.length <= 4) return 'grid-cols-1 md:grid-cols-2'
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  }

  // Handle creating a new agent
  const handleCreateAgent = () => {
    const newId = createAgent()
    if (newId) {
      const newAgent = useAgentStore.getState().getAgent(newId)
      if (newAgent) {
        openOrFocusAgent(newId, newAgent.name)
      }
    }
  }

  // Handle expanding an agent to its own tab
  const handleExpandAgent = (agentId: string) => {
    const agent = useAgentStore.getState().getAgent(agentId)
    if (agent) {
      openOrFocusAgent(agentId, agent.name)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">LUDICROUS MODE</h1>
            <p className="text-xs text-slate-500">
              Monitor and control all agents simultaneously
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            {agents.length} / {MAX_AGENTS} agents
          </span>

          <button
            onClick={handleCreateAgent}
            disabled={!canCreate}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium
              flex items-center gap-2 transition-colors
              ${canCreate
                ? 'bg-cyan-500 hover:bg-cyan-600 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }
            `}
          >
            <Bot className="w-4 h-4" />
            New Agent
          </button>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Zap className="w-16 h-16 text-amber-400/30 mb-4" />
            <h2 className="text-xl font-medium text-white mb-2">No agents active</h2>
            <p className="text-slate-400 mb-4">Create an agent to get started</p>
            <button
              onClick={handleCreateAgent}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
            >
              Create Agent
            </button>
          </div>
        ) : (
          <div className={`grid ${getGridCols()} gap-4 auto-rows-fr`}>
            {agents.map(agent => (
              <LudicrousModeCard
                key={agent.id}
                agent={agent}
                onExpand={() => handleExpandAgent(agent.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
