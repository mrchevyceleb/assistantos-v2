import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Notification, NotificationLevel } from '@/types/notification'

interface NotificationStore {
  notifications: Notification[]
  unreadCount: number

  // Actions
  addNotification: (
    title: string,
    message: string,
    level: NotificationLevel,
    options?: {
      agentId?: string
      actionLabel?: string
      actionData?: any
    }
  ) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (title, message, level, options = {}) => {
        const notification: Notification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          message,
          level,
          timestamp: Date.now(),
          read: false,
          ...options,
        }

        set(state => ({
          notifications: [notification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
      },

      markAsRead: (id) => {
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }))
      },

      markAllAsRead: () => {
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
          unreadCount: 0,
        }))
      },

      deleteNotification: (id) => {
        const notif = get().notifications.find(n => n.id === id)
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
          unreadCount: notif && !notif.read ? state.unreadCount - 1 : state.unreadCount,
        }))
      },

      clearAll: () => {
        set({
          notifications: [],
          unreadCount: 0,
        })
      },
    }),
    {
      name: 'assistantos-notifications',
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
    }
  )
)
