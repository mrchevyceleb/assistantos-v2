import { useEffect } from 'react'
import { Sidebar } from '../sidebar'
import { TabBar } from '../tabs'
import { TabContent } from './TabContent'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'

export function AppLayout() {
  const tabs = useTabStore(state => state.tabs)
  const openOrFocusAgent = useTabStore(state => state.openOrFocusAgent)
  const agents = useAgentStore(state => state.agents)

  // Initialize: Open a tab for the default agent on first load
  useEffect(() => {
    if (tabs.length === 0 && agents.length > 0) {
      const firstAgent = agents[0]
      openOrFocusAgent(firstAgent.id, firstAgent.name)
    }
  }, []) // Only run once on mount

  // Sync agent name changes to tab titles
  useEffect(() => {
    const { tabs, updateTab } = useTabStore.getState()

    tabs.forEach(tab => {
      if (tab.type === 'agent' && tab.agentId) {
        const agent = agents.find(a => a.id === tab.agentId)
        if (agent && agent.name !== tab.title) {
          updateTab(tab.id, { title: agent.name })
        }
      }
    })
  }, [agents])

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab Bar */}
        <TabBar />

        {/* Tab Content */}
        <div className="flex-1 w-full overflow-hidden">
          <TabContent />
        </div>
      </div>
    </div>
  )
}
