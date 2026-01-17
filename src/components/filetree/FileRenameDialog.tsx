import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, X, Folder, FileText } from 'lucide-react'

interface FileRenameDialogProps {
  currentName: string
  isDirectory: boolean
  onConfirm: (newName: string) => void
  onCancel: () => void
}

export function FileRenameDialog({
  currentName,
  isDirectory,
  onConfirm,
  onCancel
}: FileRenameDialogProps) {
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus and select the name without extension for files
    if (inputRef.current) {
      inputRef.current.focus()
      if (!isDirectory && currentName.includes('.')) {
        const dotIndex = currentName.lastIndexOf('.')
        inputRef.current.setSelectionRange(0, dotIndex)
      } else {
        inputRef.current.select()
      }
    }
  }, [currentName, isDirectory])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const validateName = (newName: string): string | null => {
    if (!newName.trim()) {
      return 'Name cannot be empty'
    }
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/
    if (invalidChars.test(newName)) {
      return 'Name contains invalid characters'
    }
    // Check for reserved names on Windows
    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
    if (reservedNames.test(newName.split('.')[0])) {
      return 'This name is reserved by the system'
    }
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()

    const validationError = validateName(trimmedName)
    if (validationError) {
      setError(validationError)
      return
    }

    if (trimmedName !== currentName) {
      onConfirm(trimmedName)
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
    setError(null)
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md mx-4 p-6 rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 25, 38, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.6)'
        }}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(180deg, rgba(34, 211, 238, 0.2) 0%, rgba(34, 211, 238, 0.1) 100%)',
              border: '1px solid rgba(34, 211, 238, 0.2)'
            }}
          >
            {isDirectory ? (
              <Folder className="w-7 h-7 text-cyan-400" />
            ) : (
              <FileText className="w-7 h-7 text-cyan-400" />
            )}
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-white text-center mb-4">
          Rename {isDirectory ? 'Folder' : 'File'}
        </h3>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className={`w-full px-4 py-3 rounded-xl text-sm text-white bg-slate-800/50 border focus:outline-none focus:ring-1 transition-colors mb-2 ${
              error
                ? 'border-red-400/50 focus:border-red-400/70 focus:ring-red-400/30'
                : 'border-white/10 focus:border-cyan-400/50 focus:ring-cyan-400/30'
            }`}
            placeholder={`Enter ${isDirectory ? 'folder' : 'file'} name...`}
          />

          {error && (
            <p className="text-xs text-red-400 mb-4">{error}</p>
          )}

          {!error && <div className="mb-4" />}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
              style={{ border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === currentName}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(180deg, #22d3ee 0%, #06b6d4 100%)',
                boxShadow: '0 4px 12px rgba(34, 211, 238, 0.3)'
              }}
            >
              <Edit3 className="w-4 h-4" />
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
