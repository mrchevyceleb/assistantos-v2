import { Minus, Square, X, Moon, Sun, Bell } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

export function TitleBar() {
  const { isDarkMode, toggleTheme } = useAppStore()

  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize()
  const handleClose = () => window.electronAPI?.close()

  return (
    <div
      className="h-14 flex items-center justify-between px-4 select-none relative z-10"
      style={{
        WebkitAppRegion: 'drag',
        background: isDarkMode
          ? 'linear-gradient(180deg, rgba(28, 35, 55, 0.98) 0%, rgba(15, 20, 32, 0.99) 100%)'
          : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.99) 100%)',
        borderBottom: isDarkMode
          ? '1px solid rgba(255, 255, 255, 0.08)'
          : '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: isDarkMode
          ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 3px rgba(0, 0, 0, 0.05)'
      } as React.CSSProperties}
    >
      {/* Top edge highlight - strong metallic reflection */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: isDarkMode
            ? 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.25) 30%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.25) 70%, rgba(255,255,255,0.02))'
            : 'linear-gradient(90deg, rgba(59,130,246,0.02), rgba(59,130,246,0.15) 30%, rgba(59,130,246,0.25) 50%, rgba(59,130,246,0.15) 70%, rgba(59,130,246,0.02))'
        }}
      />
      {/* Secondary inner glow */}
      <div
        className="absolute top-0 left-0 right-0 h-10"
        style={{
          background: isDarkMode
            ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 100%)'
            : 'linear-gradient(180deg, rgba(59, 130, 246, 0.03) 0%, transparent 100%)',
          pointerEvents: 'none'
        }}
      />

      {/* Left: App title */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
          }}
        >
          <span className="text-white font-display font-bold text-lg">A</span>
        </div>
        <span className={`font-display font-semibold text-lg tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
          AssistantOS
        </span>
      </div>

      {/* Center: Empty for now */}
      <div className="flex items-center gap-2" />

      {/* Right: Controls */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Theme toggle - pill shaped */}
        <div
          className="flex items-center rounded-full p-1 cursor-pointer"
          style={{
            background: isDarkMode
              ? 'linear-gradient(180deg, rgba(30, 40, 60, 0.8) 0%, rgba(20, 28, 45, 0.9) 100%)'
              : 'linear-gradient(180deg, rgba(241, 245, 249, 0.9) 0%, rgba(226, 232, 240, 0.95) 100%)',
            border: isDarkMode
              ? '1px solid rgba(255, 255, 255, 0.08)'
              : '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: isDarkMode
              ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
              : 'inset 0 1px 0 rgba(255,255,255,0.8)'
          }}
          onClick={toggleTheme}
        >
          <div className={`p-1.5 rounded-full transition-all ${isDarkMode ? 'bg-slate-700/80' : ''}`}>
            <Moon className={`w-4 h-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
          </div>
          <div className={`p-1.5 rounded-full transition-all ${!isDarkMode ? 'bg-cyan-100' : ''}`}>
            <Sun className={`w-4 h-4 ${isDarkMode ? 'text-slate-400' : 'text-amber-500'}`} />
          </div>
        </div>

        {/* Notifications */}
        <button
          className={`p-2.5 rounded-xl transition-all ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
          style={{ border: '1px solid transparent' }}
        >
          <Bell className={`w-5 h-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>

        {/* Separator */}
        <div className={`w-px h-6 mx-1 ${isDarkMode ? 'bg-white/10' : 'bg-black/10'}`} />

        {/* Window controls */}
        <button
          onClick={handleMinimize}
          className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
        >
          <Minus className={`w-4 h-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>
        <button
          onClick={handleMaximize}
          className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
        >
          <Square className={`w-3.5 h-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-red-500/20 transition-colors group"
        >
          <X className={`w-4 h-4 group-hover:text-red-400 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>
      </div>
    </div>
  )
}
