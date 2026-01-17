export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

// Action types for notification interactions
export type NotificationAction =
  | { type: 'openAgent'; agentId: string }
  | { type: 'openFile'; path: string }
  | { type: 'openTab'; tabId: string }
  | { type: 'openUrl'; url: string }
  | { type: 'runCommand'; command: string }

export interface Notification {
  id: string
  title: string
  message: string
  level: NotificationLevel
  timestamp: number
  read: boolean
  agentId?: string // Optional: link to specific agent
  actionLabel?: string // Optional: button label (e.g., "View", "Open")
  actionData?: NotificationAction // Optional: typed action data
}

export interface NotificationFilter {
  level?: NotificationLevel
  read?: boolean
  agentId?: string
}
