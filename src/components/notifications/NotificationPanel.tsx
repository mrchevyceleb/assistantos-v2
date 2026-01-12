import { useRef, useEffect } from 'react'
import { Bell, CheckCheck, Trash2, X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useNotificationStore } from '@/stores/notificationStore'
import { Notification, NotificationLevel } from '@/types/notification'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}

export function NotificationPanel({ isOpen, onClose, anchorRef }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const notifications = useNotificationStore(state => state.notifications)
  const markAsRead = useNotificationStore(state => state.markAsRead)
  const markAllAsRead = useNotificationStore(state => state.markAllAsRead)
  const deleteNotification = useNotificationStore(state => state.deleteNotification)
  const clearAll = useNotificationStore(state => state.clearAll)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, anchorRef])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const unreadNotifications = notifications.filter(n => !n.read)

  const getLevelIcon = (level: NotificationLevel) => {
    switch (level) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />
      default:
        return <Info className="w-4 h-4 text-cyan-400" />
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
    // Handle action if provided
    if (notification.actionData) {
      // TODO: Implement action handling (e.g., open agent, open file)
      console.log('[Notification Action]', notification.actionData)
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-2 w-96 max-h-[600px] rounded-2xl shadow-2xl overflow-hidden z-50"
      style={{
        background: 'linear-gradient(180deg, rgba(28, 35, 55, 0.98) 0%, rgba(15, 20, 32, 0.99) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-400" />
          <h3 className="font-display font-semibold text-white">Notifications</h3>
          {unreadNotifications.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cyan-500/20 text-cyan-400">
              {unreadNotifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <>
              <button
                onClick={markAllAsRead}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={clearAll}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="overflow-y-auto max-h-[520px]">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Bell className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400 font-medium mb-1">No notifications</p>
            <p className="text-slate-500 text-sm">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`px-4 py-3 transition-colors cursor-pointer hover:bg-white/5 ${
                  !notification.read ? 'bg-cyan-500/5' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getLevelIcon(notification.level)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-medium text-white text-sm leading-tight">
                        {notification.title}
                      </h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-500">
                          {formatTimestamp(notification.timestamp)}
                        </span>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed mb-2">
                      {notification.message}
                    </p>
                    {notification.actionLabel && (
                      <button
                        className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNotificationClick(notification)
                        }}
                      >
                        {notification.actionLabel} →
                      </button>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNotification(notification.id)
                    }}
                    className="p-1 rounded hover:bg-white/5 transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
