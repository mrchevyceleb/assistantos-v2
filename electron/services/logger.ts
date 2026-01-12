/**
 * Production-ready logging service for Electron main process.
 * Replaces console.log with structured logging that can be:
 * - Filtered by log level
 * - Sent to external services (Sentry, etc.)
 * - Written to log files
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  data?: Record<string, unknown>
}

const isDev = process.env.NODE_ENV === 'development'

// Log level priority (lower = more verbose)
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// Minimum log level for production (info and above)
const MIN_LOG_LEVEL: LogLevel = isDev ? 'debug' : 'info'

class Logger {
  private context?: string

  constructor(context?: string) {
    this.context = context
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL]
  }

  private formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data
    }
  }

  private output(entry: LogEntry): void {
    const prefix = entry.context ? `[${entry.context}]` : ''
    const msg = `${entry.timestamp} ${entry.level.toUpperCase()} ${prefix} ${entry.message}`

    switch (entry.level) {
      case 'debug':
        console.debug(msg, entry.data || '')
        break
      case 'info':
        console.info(msg, entry.data || '')
        break
      case 'warn':
        console.warn(msg, entry.data || '')
        break
      case 'error':
        console.error(msg, entry.data || '')
        break
    }

    // TODO: Send to external logging service in production
    // if (!isDev && entry.level === 'error') {
    //   sendToSentry(entry)
    // }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, data))
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, data))
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, data))
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, data))
    }
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): Logger {
    return new Logger(this.context ? `${this.context}:${context}` : context)
  }
}

// Default logger instance
export const logger = new Logger()

// Factory function for creating contextual loggers
export function createLogger(context: string): Logger {
  return new Logger(context)
}
