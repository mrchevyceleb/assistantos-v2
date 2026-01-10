import { Star, FileText, Folder } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { WidgetContainer } from './WidgetContainer'

export function QuickLinksWidget() {
  const { starredPaths, openFile, setCenterPanelView } = useAppStore()

  const getFileName = (path: string) => {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1]
  }

  const isDirectory = (path: string) => {
    const name = getFileName(path)
    return !name.includes('.')
  }

  return (
    <WidgetContainer
      title="Quick Links"
      icon={<Star className="w-4 h-4 text-amber-400" />}
    >
      {starredPaths.length === 0 ? (
        <div className="text-center py-4">
          <Star className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No starred files</p>
          <p className="text-xs text-slate-500 mt-1">Star files in the file tree for quick access</p>
        </div>
      ) : (
        <div className="space-y-1">
          {starredPaths.slice(0, 5).map((path) => {
            const isDir = isDirectory(path)
            return (
              <button
                key={path}
                onClick={() => {
                  if (!isDir) {
                    openFile(path)
                    setCenterPanelView('editor')
                  }
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                {isDir ? (
                  <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <span className="text-sm text-slate-300 truncate">{getFileName(path)}</span>
              </button>
            )
          })}
          {starredPaths.length > 5 && (
            <p className="text-xs text-slate-500 text-center pt-2">
              +{starredPaths.length - 5} more in sidebar
            </p>
          )}
        </div>
      )}
    </WidgetContainer>
  )
}
