import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FilePlus, FolderPlus, X } from 'lucide-react'

interface NewItemDialogProps {
  type: 'file' | 'folder'
  parentPath: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NewItemDialog({
  type,
  parentPath,
  onConfirm,
  onCancel
}: NewItemDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const validateName = (value: string): string => {
    if (!value.trim()) {
      return 'Name cannot be empty'
    }
    // Check for invalid characters (Windows-specific)
    const invalidChars = /[<>:"/\\|?*]/
    if (invalidChars.test(value)) {
      return 'Name contains invalid characters'
    }
    // Reserved names on Windows
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
    if (reserved.test(value.split('.')[0])) {
      return 'This name is reserved by the system'
    }
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    // Check if file/folder already exists
    if (window.electronAPI) {
      const path = await import('path-browserify')
      const newPath = path.join(parentPath, name)
      const exists = await window.electronAPI.fs.exists(newPath)
      if (exists) {
        setError(`A ${type} with this name already exists`)
        return
      }
    }

    onConfirm(name)
  }

  const Icon = type === 'file' ? FilePlus : FolderPlus

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
              background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 212, 255, 0.1) 100%)',
              border: '1px solid rgba(0, 212, 255, 0.2)'
            }}
          >
            <Icon className="w-7 h-7 text-cyan-400" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-white text-center mb-4">
          New {type === 'file' ? 'File' : 'Folder'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder={type === 'file' ? 'filename.txt' : 'folder-name'}
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-slate-500 outline-none transition-all"
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: error ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)'
              }}
            />
            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}
          </div>

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
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors hover:opacity-90"
              style={{
                background: 'linear-gradient(180deg, #00d4ff 0%, #00a8cc 100%)',
                boxShadow: '0 4px 12px rgba(0, 212, 255, 0.3)'
              }}
            >
              <Icon className="w-4 h-4" />
              Create
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
