import { useState } from 'react'
import { X, Zap, Check, HelpCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { isValidCommandName } from '@/services/shortcuts/parser'

interface CreateShortcutDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (name: string) => void
}

export function CreateShortcutDialog({ isOpen, onClose, onCreated }: CreateShortcutDialogProps) {
  const { addShortcut, shortcuts } = useAppStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [argumentHint, setArgumentHint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showArgumentHelp, setShowArgumentHelp] = useState(false)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate name
    const cleanName = name.toLowerCase().replace(/^\//, '').trim()
    if (!cleanName) {
      setError('Name is required')
      return
    }
    if (!isValidCommandName(cleanName)) {
      setError('Name can only contain letters, numbers, and hyphens')
      return
    }
    if (shortcuts.some(s => s.name === cleanName)) {
      setError('A shortcut with this name already exists')
      return
    }
    if (!prompt.trim()) {
      setError('Prompt is required')
      return
    }

    // Add the shortcut
    addShortcut({
      name: cleanName,
      description: description.trim() || `Custom shortcut: ${cleanName}`,
      prompt: prompt.trim(),
      argumentHint: argumentHint.trim() || undefined,
      isBuiltIn: false
    })

    // Reset form and close
    setName('')
    setDescription('')
    setPrompt('')
    setArgumentHint('')
    onCreated?.(cleanName)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.98) 0%, rgba(20, 28, 45, 0.99) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.1)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.3) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.3)'
              }}
            >
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Create Shortcut</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Command Name
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 font-mono">/</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))}
                placeholder="my-command"
                className="input-metallic w-full pl-7 text-sm font-mono"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Letters, numbers, and hyphens only</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Description <span className="text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this shortcut does"
              className="input-metallic w-full text-sm"
            />
          </div>

          {/* Argument Hint */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-sm font-medium text-slate-300">
                Argument Hint <span className="text-slate-500">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowArgumentHelp(!showArgumentHelp)}
                className="text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={argumentHint}
              onChange={(e) => setArgumentHint(e.target.value)}
              placeholder="e.g., TOPIC, [URL], MESSAGE"
              className="input-metallic w-full text-sm font-mono"
            />
            {showArgumentHelp && (
              <div className="mt-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm">
                <p className="text-purple-300 font-medium mb-2">Using Arguments</p>
                <p className="text-slate-400 mb-2">
                  Arguments allow users to pass data to your shortcut:
                </p>
                <ul className="text-slate-400 space-y-1 text-xs">
                  <li><code className="text-purple-400">/research AI trends</code> - "AI trends" is the argument</li>
                  <li><code className="text-purple-400">TOPIC</code> - Required argument (uppercase)</li>
                  <li><code className="text-purple-400">[URL]</code> - Optional argument (in brackets)</li>
                </ul>
                <p className="text-slate-400 mt-2 text-xs">
                  Use <code className="text-cyan-400">$ARGUMENTS</code> in your prompt where arguments should be inserted.
                </p>
              </div>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={argumentHint
                ? "Use $ARGUMENTS where you want the user's input inserted..."
                : "The message to send when this shortcut is used..."
              }
              className="input-metallic w-full text-sm min-h-[100px] resize-y"
              rows={4}
            />
            <p className="text-xs text-slate-500 mt-1">
              {argumentHint
                ? 'Use $ARGUMENTS for required args, or $ARGUMENTS_SECTION for optional context'
                : 'You can use @mentions like @gmail or @calendar'
              }
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: 'white',
                boxShadow: '0 0 15px rgba(168, 85, 247, 0.3)'
              }}
            >
              <Check className="w-4 h-4" />
              Create Shortcut
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
