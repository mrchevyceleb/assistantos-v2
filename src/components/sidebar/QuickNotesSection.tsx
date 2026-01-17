import { useState } from 'react'
import { ChevronDown, ChevronRight, StickyNote, X, Plus, Edit3 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useTabStore } from '@/stores/tabStore'

export function QuickNotesSection() {
  const [isCollapsed, setIsCollapsed] = useState(true)

  const quickNotes = useAppStore((state) => state.quickNotes)
  const deleteQuickNote = useAppStore((state) => state.deleteQuickNote)
  const openOrFocusNote = useTabStore((state) => state.openOrFocusNote)
  const closeNoteTab = useTabStore((state) => state.closeNoteTab)

  // Open new note in tab
  const handleCreateNewNote = (e: React.MouseEvent) => {
    e.stopPropagation()
    openOrFocusNote(null, 'New Note')
  }

  // Open existing note in tab
  const handleOpenNote = (noteId: string) => {
    const note = quickNotes.find(n => n.id === noteId)
    if (note) {
      const title = note.text.split('\n')[0].slice(0, 30)
      openOrFocusNote(noteId, title)
    }
  }

  // Delete note and close its tab if open
  const handleDeleteNote = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation()
    if (confirm('Delete this note?')) {
      deleteQuickNote(noteId)
      closeNoteTab(noteId)
    }
  }

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="border-b border-white/5 flex-shrink-0">
      {/* Section Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="
          w-full flex items-center justify-between px-4 py-3
          text-slate-400 hover:text-white transition-colors cursor-pointer
        "
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <StickyNote className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-medium uppercase tracking-wider">Quick Notes</span>
          {quickNotes.length > 0 && (
            <span className="text-xs text-slate-500">
              ({quickNotes.length})
            </span>
          )}
        </div>

        {/* Add Button */}
        <button
          onClick={handleCreateNewNote}
          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-amber-400 transition-colors"
          title="Create new note"
          aria-label="Create new note"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Notes Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3">
          {/* Notes List */}
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {quickNotes.length === 0 ? (
              <div className="text-xs text-slate-500 py-2 px-1">
                No notes yet. Click + to create one.
              </div>
            ) : (
              quickNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleOpenNote(note.id)}
                  className="
                    group relative
                    bg-slate-800/30 border border-slate-700/30
                    rounded px-2 py-1.5
                    hover:border-amber-500/30 hover:bg-slate-800/50
                    cursor-pointer
                    transition-colors
                  "
                >
                  {/* Note Text */}
                  <p className="text-xs text-slate-300 pr-12 whitespace-pre-wrap break-words line-clamp-3">
                    {note.text}
                  </p>

                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-600 mt-1 block">
                    {formatTimeAgo(note.createdAt)}
                  </span>

                  {/* Action Buttons */}
                  <div className="
                    absolute top-1 right-1
                    flex items-center gap-1
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                  ">
                    {/* Edit indicator */}
                    <Edit3 className="w-3 h-3 text-amber-400" />

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDeleteNote(e, note.id)}
                      className="
                        p-0.5 rounded
                        text-slate-600 hover:text-red-400
                        transition-colors
                      "
                      title="Delete note"
                      aria-label="Delete note"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
