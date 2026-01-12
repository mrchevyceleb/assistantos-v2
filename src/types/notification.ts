export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  title: string
  message: string
  level: NotificationLevel
  timestamp: number
  read: boolean
  agentId?: string // Optional: link to specific agent
  actionLabel?: string // Optional: button label (e.g., "View", "Open")
  actionData?: any // Optional: data for the action
}

export interface NotificationFilter {
  level?: NotificationLevel
  read?: boolean
  agentId?: string
}
