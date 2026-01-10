import { useEffect } from 'react'
import { PanelLayout } from './components/layout/PanelLayout'
import { TitleBar } from './components/layout/TitleBar'
import { useAppStore } from './stores/appStore'

function App() {
  const isDarkMode = useAppStore((state) => state.isDarkMode)

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

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
