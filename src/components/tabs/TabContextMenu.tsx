import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, Trash2 } from 'lucide-react'

interface TabContextMenuProps {
  x: number
  y: number
  tabName: string
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

function MenuItem({ icon, label, onClick, variant = 'default' }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

export function TabContextMenu({
  x,
  y,
  tabName,
  onClose,
  onRename,
  onDelete
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust position to keep menu in viewport
  const getAdjustedPosition = useCallback(() => {
    if (!menuRef.current) return { x, y }

    const menuRect = menuRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let adjustedX = x
    let adjustedY = y

    // Check right edge
    if (x + menuRect.width > viewportWidth - 10) {
      adjustedX = viewportWidth - menuRect.width - 10
    }

    // Check bottom edge
    if (y + menuRect.height > viewportHeight - 10) {
      adjustedY = viewportHeight - menuRect.height - 10
    }

    // Ensure minimum position
    adjustedX = Math.max(10, adjustedX)
    adjustedY = Math.max(10, adjustedY)

    return { x: adjustedX, y: adjustedY }
  }, [x, y])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const handleRename = () => {
    onRename()
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  const adjustedPos = getAdjustedPosition()

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[160px] p-1.5 rounded-xl shadow-2xl"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 25, 38, 0.99) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1) inset'
      }}
    >
      {/* Header showing tab name */}
      <div className="px-3 py-2 border-b border-white/5 mb-1">
        <span className="text-xs text-slate-500 truncate block max-w-[140px]" title={tabName}>
          {tabName}
        </span>
      </div>

      <MenuItem
        icon={<Edit3 className="w-4 h-4" />}
        label="Rename"
        onClick={handleRename}
      />
      <MenuItem
        icon={<Trash2 className="w-4 h-4" />}
        label="Delete"
        onClick={handleDelete}
        variant="danger"
      />
    </div>,
    document.body
  )
}
