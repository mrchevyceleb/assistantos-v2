import { create } from 'zustand'

// File operation types
export type FileOperationType = 'read' | 'write'

// File operation status
export type FileOperationStatus = 'queued' | 'active' | 'completed' | 'failed'

// File operation record
export interface FileOperation {
  id: string
  agentId: string
  agentName: string           // For display purposes
  filePath: string
  operation: FileOperationType
  status: FileOperationStatus
  queuedAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: string
}

// Pending operation resolver
interface PendingResolver {
  resolve: () => void
  reject: (error: Error) => void
}

// File lock store interface
interface FileLockStore {
  // State
  operations: FileOperation[]
  activeOperations: Map<string, FileOperation>    // filePath -> active operation
  pendingResolvers: Map<string, PendingResolver>  // operationId -> resolver

  // Queue operations
  requestOperation: (
    agentId: string,
    agentName: string,
    filePath: string,
    operation: FileOperationType
  ) => Promise<string>  // Returns operation ID when lock is acquired

  // Release operations
  releaseOperation: (operationId: string, error?: string) => void

  // Query operations
  getQueuePosition: (operationId: string) => number
  isFileLocked: (filePath: string) => boolean
  getActiveOperation: (filePath: string) => FileOperation | undefined
  getQueuedOperations: (filePath: string) => FileOperation[]
  getAgentOperations: (agentId: string) => FileOperation[]

  // Utility
  clearCompletedOperations: () => void
  getOperationHistory: () => FileOperation[]
}

// Generate unique operation ID
function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Normalize file path for consistent comparison
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

export const useFileLockStore = create<FileLockStore>((set, get) => ({
  // Initial state
  operations: [],
  activeOperations: new Map(),
  pendingResolvers: new Map(),

  // Request a file operation (acquires lock or queues)
  requestOperation: (agentId, agentName, filePath, operation) => {
    return new Promise((resolve, reject) => {
      const normalizedPath = normalizePath(filePath)
      const operationId = generateOperationId()

      const newOperation: FileOperation = {
        id: operationId,
        agentId,
        agentName,
        filePath: normalizedPath,
        operation,
        status: 'queued',
        queuedAt: new Date(),
      }

      const state = get()
      const activeOp = state.activeOperations.get(normalizedPath)

      if (!activeOp) {
        // No active operation - acquire lock immediately
        newOperation.status = 'active'
        newOperation.startedAt = new Date()

        const newActiveOps = new Map(state.activeOperations)
        newActiveOps.set(normalizedPath, newOperation)

        set({
          operations: [...state.operations, newOperation],
          activeOperations: newActiveOps,
        })

        // Resolve immediately
        resolve(operationId)
      } else {
        // File is locked - queue the operation
        set({
          operations: [...state.operations, newOperation],
          pendingResolvers: new Map(state.pendingResolvers).set(operationId, {
            resolve: () => resolve(operationId),
            reject,
          }),
        })

        // Don't resolve yet - will be resolved when lock is released
      }
    })
  },

  // Release a file operation
  releaseOperation: (operationId, error) => {
    const state = get()
    const operation = state.operations.find(op => op.id === operationId)

    if (!operation) return

    const normalizedPath = operation.filePath

    // Update the operation status
    const updatedOperations = state.operations.map(op =>
      op.id === operationId
        ? {
            ...op,
            status: error ? 'failed' as FileOperationStatus : 'completed' as FileOperationStatus,
            completedAt: new Date(),
            error,
          }
        : op
    )

    // Remove from active operations
    const newActiveOps = new Map(state.activeOperations)
    newActiveOps.delete(normalizedPath)

    // Find next queued operation for this file
    const queuedOps = updatedOperations
      .filter(op =>
        op.filePath === normalizedPath &&
        op.status === 'queued'
      )
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())

    const nextOp = queuedOps[0]

    if (nextOp) {
      // Activate next operation
      const finalOperations = updatedOperations.map(op =>
        op.id === nextOp.id
          ? { ...op, status: 'active' as FileOperationStatus, startedAt: new Date() }
          : op
      )

      newActiveOps.set(normalizedPath, {
        ...nextOp,
        status: 'active',
        startedAt: new Date(),
      })

      // Resolve the pending promise
      const resolver = state.pendingResolvers.get(nextOp.id)
      if (resolver) {
        resolver.resolve()
      }

      // Remove resolver from map
      const newResolvers = new Map(state.pendingResolvers)
      newResolvers.delete(nextOp.id)

      set({
        operations: finalOperations,
        activeOperations: newActiveOps,
        pendingResolvers: newResolvers,
      })
    } else {
      set({
        operations: updatedOperations,
        activeOperations: newActiveOps,
      })
    }
  },

  // Get queue position for an operation
  getQueuePosition: (operationId) => {
    const { operations } = get()
    const operation = operations.find(op => op.id === operationId)

    if (!operation || operation.status !== 'queued') {
      return -1
    }

    const queuedOps = operations
      .filter(op =>
        op.filePath === operation.filePath &&
        op.status === 'queued'
      )
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())

    return queuedOps.findIndex(op => op.id === operationId)
  },

  // Check if file is locked
  isFileLocked: (filePath) => {
    return get().activeOperations.has(normalizePath(filePath))
  },

  // Get active operation for file
  getActiveOperation: (filePath) => {
    return get().activeOperations.get(normalizePath(filePath))
  },

  // Get queued operations for file
  getQueuedOperations: (filePath) => {
    const normalizedPath = normalizePath(filePath)
    return get().operations
      .filter(op =>
        op.filePath === normalizedPath &&
        op.status === 'queued'
      )
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())
  },

  // Get all operations for an agent
  getAgentOperations: (agentId) => {
    return get().operations
      .filter(op => op.agentId === agentId)
      .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime())
  },

  // Clear completed/failed operations from history
  clearCompletedOperations: () => {
    set(state => ({
      operations: state.operations.filter(op =>
        op.status === 'queued' || op.status === 'active'
      ),
    }))
  },

  // Get operation history (for debugging/display)
  getOperationHistory: () => {
    return [...get().operations].sort((a, b) =>
      b.queuedAt.getTime() - a.queuedAt.getTime()
    )
  },
}))

// Utility hook for components that need to show lock status
export function useFileLockStatus(filePath: string) {
  const isLocked = useFileLockStore(state => state.isFileLocked(filePath))
  const activeOp = useFileLockStore(state => state.getActiveOperation(filePath))
  const queueLength = useFileLockStore(state => state.getQueuedOperations(filePath).length)

  return {
    isLocked,
    activeOperation: activeOp,
    queueLength,
  }
}
