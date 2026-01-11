import { useState } from 'react'
import { ChevronRight, ChevronDown, Star, FileText, Folder, Image, Film, Music } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { isImageFile, isVideoFile, isAudioFile } from '../../utils/fileTypes'

export function StarredSection() {
  const { starredPaths, toggleStarred, openFile, currentFile, setCenterPanelView } = useAppStore()
  const [isExpanded, setIsExpanded] = useState(true)

  if (starredPaths.length === 0) return null

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1]
  }

  const isDirectory = (path: string) => {
    // Simple heuristic: if it has an extension, it's likely a file
    const name = getFileName(path)
    return !name.includes('.')
  }

  return (
    <div className="border-b border-white/5">
      {/* Header */}
      <div
        className="flex items-center gap-2 py-2 px-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Starred
        </span>
        <span className="text-xs text-slate-500 ml-auto">{starredPaths.length}</span>
      </div>

      {/* Starred Items */}
      {isExpanded && (
        <div className="pb-2">
          {starredPaths.map((path) => {
            const isDir = isDirectory(path)
            const isSelected = currentFile === path

            return (
              <div
                key={path}
                className={`group flex items-center gap-2 py-1.5 px-4 cursor-pointer transition-all rounded-lg mx-2 ${
                  isSelected ? '' : 'hover:bg-white/5'
                }`}
                style={isSelected ? {
                  background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
                  borderLeft: '2px solid #00d4ff'
                } : {}}
                onClick={() => {
                  if (!isDir) {
                    openFile(path)
                    setCenterPanelView('editor')
                  }
                }}
              >
                {isDir ? (
                  <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                ) : isImageFile(path) ? (
                  <Image className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                ) : isVideoFile(path) ? (
                  <Film className="w-4 h-4 text-violet-400 flex-shrink-0" />
                ) : isAudioFile(path) ? (
                  <Music className="w-4 h-4 text-pink-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <span className={`text-sm truncate flex-1 ${isSelected ? 'text-cyan-400 font-medium' : 'text-slate-300'}`}>
                  {getFileName(path)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleStarred(path)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
                  title="Unstar"
                >
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
