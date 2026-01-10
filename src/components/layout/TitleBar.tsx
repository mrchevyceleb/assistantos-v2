import { Minus, Square, X, Bell } from 'lucide-react'

export function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize()
  const handleClose = () => window.electronAPI?.close()

  return (
    <div
      className="h-14 flex items-center justify-between px-4 select-none relative z-10"
      style={{
        WebkitAppRegion: 'drag',
        background: 'linear-gradient(180deg, rgba(28, 35, 55, 0.98) 0%, rgba(15, 20, 32, 0.99) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      } as React.CSSProperties}
    >
      {/* Top edge highlight - strong metallic reflection */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.25) 30%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.25) 70%, rgba(255,255,255,0.02))'
        }}
      />
      {/* Secondary inner glow */}
      <div
        className="absolute top-0 left-0 right-0 h-10"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 100%)',
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
        <span className="font-display font-semibold text-lg tracking-tight text-white">
          AssistantOS
        </span>
      </div>

      {/* Center: Empty for now */}
      <div className="flex items-center gap-2" />

      {/* Right: Controls */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Notifications */}
        <button
          className="p-2.5 rounded-xl transition-all hover:bg-white/5"
          style={{ border: '1px solid transparent' }}
        >
          <Bell className="w-5 h-5 text-slate-400" />
        </button>

        {/* Separator */}
        <div className="w-px h-6 mx-1 bg-white/10" />

        {/* Window controls */}
        <button
          onClick={handleMinimize}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
        >
          <Minus className="w-4 h-4 text-slate-400" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
        >
          <Square className="w-3.5 h-3.5 text-slate-400" />
        </button>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-red-500/20 transition-colors group"
        >
          <X className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
        </button>
      </div>
    </div>
  )
}
