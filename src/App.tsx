import { useEffect } from 'react'
import { PanelLayout } from './components/layout/PanelLayout'
import { TitleBar } from './components/layout/TitleBar'

function App() {
  useEffect(() => {
    // Always use dark mode
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <main className="flex-1 flex overflow-hidden">
        <PanelLayout />
      </main>
    </div>
  )
}

export default App
