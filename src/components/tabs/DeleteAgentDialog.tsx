import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Trash2, X } from 'lucide-react'

interface DeleteAgentDialogProps {
  agentName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteAgentDialog({
  agentName,
  onConfirm,
  onCancel
}: DeleteAgentDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
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
              background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}
          >
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-white text-center mb-2">
          Delete Chat
        </h3>
        <p className="text-sm text-slate-400 text-center mb-6">
          Are you sure you want to delete{' '}
          <span className="text-slate-200 font-medium">"{agentName}"</span>?
          <span className="block mt-1 text-slate-500">
            All conversation history will be lost.
          </span>
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
            style={{ border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors hover:opacity-90"
            style={{
              background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
