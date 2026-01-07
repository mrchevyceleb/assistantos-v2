import { PanelLayout } from './components/layout/PanelLayout'
import { TitleBar } from './components/layout/TitleBar'

function App() {
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
