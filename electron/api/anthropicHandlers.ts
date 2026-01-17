/**
 * Anthropic API IPC Handlers
 *
 * Handles Anthropic API calls from the main process for security.
 * API key never touches renderer memory.
 */

import { ipcMain, BrowserWindow } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, Tool, ContentBlock, RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'

// Store active stream controllers for cancellation
const activeStreams = new Map<string, AbortController>()

/**
 * Register all Anthropic API IPC handlers
 */
export function registerAnthropicHandlers(): void {
  console.log('[Anthropic] Registering IPC handlers...')

  // Validate API key
  ipcMain.handle('anthropic:validateKey', async (_event, apiKey: string) => {
    try {
      const client = new Anthropic({ apiKey })
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      })
      return { valid: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { valid: false, error: errorMessage }
    }
  })

  // Non-streaming message creation (for simple requests like title generation)
  ipcMain.handle(
    'anthropic:messages:create',
    async (
      _event,
      params: {
        apiKey: string
        model: string
        maxTokens: number
        messages: MessageParam[]
        system?: string
        tools?: Tool[]
      }
    ) => {
      try {
        const client = new Anthropic({ apiKey: params.apiKey })
        const response = await client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          messages: params.messages,
          system: params.system,
          tools: params.tools,
        })
        return { success: true, data: response }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  // Streaming message creation (for chat)
  ipcMain.handle(
    'anthropic:messages:stream',
    async (
      event,
      params: {
        streamId: string
        apiKey: string
        model: string
        maxTokens: number
        messages: MessageParam[]
        system?: string
        tools?: Tool[]
      }
    ) => {
      const { streamId, apiKey, model, maxTokens, messages, system, tools } = params

      // Get the sender window
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        return { success: false, error: 'No window found' }
      }

      // Create abort controller for this stream
      const abortController = new AbortController()
      activeStreams.set(streamId, abortController)

      try {
        const client = new Anthropic({ apiKey })

        const stream = await client.messages.stream({
          model,
          max_tokens: maxTokens,
          messages,
          system,
          tools,
        })

        // Forward stream events to renderer
        for await (const event of stream) {
          // Check if stream was cancelled
          if (abortController.signal.aborted) {
            break
          }

          // Send event to renderer
          if (!window.isDestroyed()) {
            window.webContents.send(`anthropic:stream:${streamId}`, {
              type: 'event',
              event,
            })
          }
        }

        // Get final message
        const finalMessage = await stream.finalMessage()

        // Send completion event
        if (!window.isDestroyed()) {
          window.webContents.send(`anthropic:stream:${streamId}`, {
            type: 'done',
            message: finalMessage,
          })
        }

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Send error event
        if (!window.isDestroyed()) {
          window.webContents.send(`anthropic:stream:${streamId}`, {
            type: 'error',
            error: errorMessage,
          })
        }

        return { success: false, error: errorMessage }
      } finally {
        activeStreams.delete(streamId)
      }
    }
  )

  // Cancel a stream
  ipcMain.handle('anthropic:stream:cancel', async (_event, streamId: string) => {
    const controller = activeStreams.get(streamId)
    if (controller) {
      controller.abort()
      activeStreams.delete(streamId)
      return { success: true }
    }
    return { success: false, error: 'Stream not found' }
  })

  console.log('[Anthropic] IPC handlers registered successfully')
}

/**
 * Cleanup function to abort all active streams
 */
export function cleanupAnthropicHandlers(): void {
  for (const [streamId, controller] of activeStreams) {
    controller.abort()
    activeStreams.delete(streamId)
  }
}
