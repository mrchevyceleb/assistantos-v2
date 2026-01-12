import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useTabStore } from '@/stores/tabStore'
import { StickyNote, Save, Trash2 } from 'lucide-react'

interface NoteEditorProps {
  noteId?: string  // undefined for new notes
  tabId: string
}

export function NoteEditor({ noteId, tabId }: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const quickNotes = useAppStore((state) => state.quickNotes)
  const addQuickNote = useAppStore((state) => state.addQuickNote)
  const updateQuickNote = useAppStore((state) => state.updateQuickNote)
  const deleteQuickNote = useAppStore((state) => state.deleteQuickNote)

  const updateTab = useTabStore((state) => state.updateTab)
  const closeTab = useTabStore((state) => state.closeTab)

  // Find existing note
  const existingNote = noteId ? quickNotes.find(n => n.id === noteId) : undefined

  // Local state for editing
  const [noteText, setNoteText] = useState(existingNote?.text || '')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Update local state when note changes from outside
  useEffect(() => {
    if (existingNote) {
      setNoteText(existingNote.text)
      setHasUnsavedChanges(false)
    }
  }, [existingNote])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNoteText(e.target.value)
    setHasUnsavedChanges(true)
  }

  const handleSave = () => {
    const trimmed = noteText.trim()
    if (!trimmed) return

    if (noteId) {
      // Update existing note
      updateQuickNote(noteId, trimmed)

      // Update tab title to first line of note
      const firstLine = trimmed.split('\n')[0].slice(0, 30)
      updateTab(tabId, { title: firstLine })
    } else {
      // Create new note
      addQuickNote(trimmed)

      // Update tab with new note ID
      const newNote = quickNotes[0]  // Newest note is at the beginning
      if (newNote) {
        const firstLine = trimmed.split('\n')[0].slice(0, 30)
        updateTab(tabId, {
          noteId: newNote.id,
          title: firstLine
        })
      }
    }

    setHasUnsavedChanges(false)
  }

  const handleDelete = () => {
    if (noteId && confirm('Delete this note?')) {
      deleteQuickNote(noteId)
      closeTab(tabId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Save with Ctrl+S or Cmd+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  const charCount = noteText.length
  const maxChars = 200
  const isOverLimit = charCount > maxChars

  return (
    <div className="flex flex-col h-full bg-slate-900/50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <StickyNote className="w-5 h-5 text-amber-500" />
          <span className="text-sm text-slate-400">
            {noteId ? 'Edit Note' : 'New Note'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Character counter */}
          <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-slate-500'}`}>
            {charCount}/{maxChars}
          </span>

          {/* Delete button (only for existing notes) */}
          {noteId && (
            <button
              onClick={handleDelete}
              className="
                px-3 py-1.5 rounded-lg
                text-xs font-medium
                text-slate-400 hover:text-red-400
                hover:bg-red-500/10
                transition-colors
                flex items-center gap-1.5
              "
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!noteText.trim() || !hasUnsavedChanges || isOverLimit}
            className="
              px-3 py-1.5 rounded-lg
              text-xs font-medium
              bg-amber-500/20 text-amber-400
              hover:bg-amber-500/30
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
              flex items-center gap-1.5
            "
            title="Save note (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden p-6">
        <textarea
          ref={textareaRef}
          value={noteText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your note here..."
          className="
            w-full h-full
            bg-transparent
            text-slate-200 text-sm
            placeholder-slate-600
            focus:outline-none
            resize-none
            font-sans
          "
          maxLength={maxChars}
        />
      </div>

      {/* Footer hint */}
      <div className="px-6 py-3 border-t border-white/5">
        <p className="text-xs text-slate-500">
          {hasUnsavedChanges && (
            <span className="text-amber-500">Unsaved changes • </span>
          )}
          Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Ctrl+S</kbd> to save
        </p>
      </div>
    </div>
  )
}
