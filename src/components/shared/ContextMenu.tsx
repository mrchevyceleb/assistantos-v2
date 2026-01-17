import { useEffect, useRef, useCallback, RefObject, ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ============================================================================
// Types
// ============================================================================

export interface MenuItemProps {
  icon: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  shortcut?: string
  disabled?: boolean
}

export interface ContextMenuContainerProps {
  x: number
  y: number
  children: ReactNode
  onClose: () => void
  minWidth?: number
  header?: string
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to calculate viewport-aware menu position
 */
export function useContextMenuPosition(
  x: number,
  y: number,
  menuRef: RefObject<HTMLElement | null>
) {
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
  }, [x, y, menuRef])

  return getAdjustedPosition
}

/**
 * Hook to handle context menu close events (click outside, escape, scroll)
 */
export function useContextMenuClose(
  onClose: () => void,
  menuRef: RefObject<HTMLElement | null>
) {
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
  }, [onClose, menuRef])
}

// ============================================================================
// Components
// ============================================================================

/**
 * Individual menu item button
 */
export function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
  shortcut,
  disabled = false
}: MenuItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
        disabled
          ? 'text-slate-600 cursor-not-allowed'
          : variant === 'danger'
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-xs text-slate-500">{shortcut}</span>
      )}
    </button>
  )
}

/**
 * Horizontal divider between menu sections
 */
export function MenuDivider() {
  return <div className="h-px bg-white/5 my-1" />
}

/**
 * Header with name/title for the menu
 */
export function MenuHeader({ name, maxWidth = 180 }: { name: string; maxWidth?: number }) {
  return (
    <div className="px-3 py-2 border-b border-white/5 mb-1">
      <span
        className="text-xs text-slate-500 truncate block"
        style={{ maxWidth }}
        title={name}
      >
        {name}
      </span>
    </div>
  )
}

/**
 * Context menu container with portal rendering and positioning
 */
export function ContextMenuContainer({
  x,
  y,
  children,
  onClose,
  minWidth = 200,
  header
}: ContextMenuContainerProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const getAdjustedPosition = useContextMenuPosition(x, y, menuRef)
  useContextMenuClose(onClose, menuRef)

  const adjustedPos = getAdjustedPosition()

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] p-1.5 rounded-xl shadow-2xl"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        minWidth,
        background: 'linear-gradient(180deg, rgba(30, 35, 50, 0.98) 0%, rgba(20, 25, 38, 0.99) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1) inset'
      }}
    >
      {header && <MenuHeader name={header} maxWidth={minWidth - 20} />}
      {children}
    </div>,
    document.body
  )
}
