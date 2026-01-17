/**
 * Chat Utilities
 *
 * Standalone utility functions for the chat system.
 * Extracted from AgentChatContainer.tsx for better maintainability.
 */

import type { DocumentMention } from '../../../services/mentions/parser'
import { allTools } from '../../../services/tools'
import { getCachedMCPTools } from '../../../services/toolCache'

/**
 * AttachedImage type for image attachments
 */
export interface AttachedImage {
  id: string
  data: string // base64 encoded (without data URL prefix)
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  preview: string // data URL for preview display
  name: string
}

/**
 * Convert a File to AttachedImage format
 */
export async function fileToAttachedImage(file: File): Promise<AttachedImage | null> {
  // Validate file type (be lenient for Windows clipboard)
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
  const isValidMime = validTypes.includes(file.type)
  const hasImageExtension = /\.(png|jpe?g|gif|webp)$/i.test(file.name)

  if (!isValidMime && !hasImageExtension) {
    return null
  }

  // Infer media type if mime type is missing (Windows clipboard edge case)
  let mediaType: AttachedImage['mediaType'] = 'image/png' // default
  const fileType = file.type as string

  if (fileType && fileType !== 'application/octet-stream') {
    if (fileType === 'image/png') mediaType = 'image/png'
    else if (fileType === 'image/jpeg' || fileType === 'image/jpg') mediaType = 'image/jpeg'
    else if (fileType === 'image/gif') mediaType = 'image/gif'
    else if (fileType === 'image/webp') mediaType = 'image/webp'
  } else {
    // Infer from extension
    const ext = file.name.match(/\.(png|jpe?g|gif|webp)$/i)?.[1]?.toLowerCase()
    if (ext === 'png') mediaType = 'image/png'
    else if (ext === 'jpg' || ext === 'jpeg') mediaType = 'image/jpeg'
    else if (ext === 'gif') mediaType = 'image/gif'
    else if (ext === 'webp') mediaType = 'image/webp'
  }

  // Size validation (max 10MB to prevent memory issues)
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    return null
  }

  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const dataUrl = e.target?.result as string
        if (!dataUrl) {
          resolve(null)
          return
        }

        // Extract base64 data (remove "data:image/png;base64," prefix)
        const base64Data = dataUrl.split(',')[1]

        if (!base64Data) {
          resolve(null)
          return
        }

        const image: AttachedImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          data: base64Data,
          mediaType,
          preview: dataUrl,
          name: file.name || 'pasted-image.png'
        }

        resolve(image)
      } catch (err) {
        console.error('[Image] Error processing file:', err)
        resolve(null)
      }
    }

    reader.onerror = (err) => {
      console.error('[Image] FileReader error:', err)
      resolve(null)
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Convert clipboard data to AttachedImage
 */
export async function clipboardToAttachedImage(item: DataTransferItem): Promise<AttachedImage | null> {
  const file = item.getAsFile()
  if (!file) return null
  return fileToAttachedImage(file)
}

/**
 * Read and format referenced document content
 */
export async function readDocumentContext(documents: DocumentMention[]): Promise<string> {
  const docContents: string[] = []

  for (const doc of documents) {
    try {
      const content = await window.electronAPI.fs.readFile(doc.path)
      if (content) {
        docContents.push(`--- ${doc.relativePath} ---\n${content}\n`)
      }
    } catch (e) {
      console.error(`Failed to read document: ${doc.path}`, e)
    }
  }

  if (docContents.length === 0) return ''
  return `\n\n<referenced_documents>\n${docContents.join('\n')}</referenced_documents>`
}

/**
 * Sanitize a single tool name to comply with Anthropic API requirements
 * Pattern: ^[a-zA-Z0-9_-]{1,128}$
 * Replaces @ and . with underscores for Gmail tools (e.g., gmail_user@gmail.com → gmail_user_gmail_com)
 */
export function sanitizeToolName(toolName: string): string {
  return toolName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 128)
}

/**
 * Sanitize MCP tools to ensure names comply with API requirements
 * Handles both tool.name and tool.custom.name formats
 * Returns both sanitized tools and a mapping for reverse lookup during execution
 *
 * Uses 'any' type to avoid conflicts with Anthropic SDK's Tool type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeMCPTools(tools: any[]): { tools: any[], nameMap: Map<string, string> } {
  const nameMap = new Map<string, string>()

  const sanitizedTools = tools.map(tool => {
    // Check tool.name (standard format)
    if (tool.name && !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.name)) {
      const originalName = tool.name
      const sanitizedName = sanitizeToolName(tool.name)
      nameMap.set(sanitizedName, originalName)
      return { ...tool, name: sanitizedName }
    }

    // Check tool.custom.name (MCP custom tool format)
    if (tool.custom?.name && !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.custom.name)) {
      const originalName = tool.custom.name
      const sanitizedName = sanitizeToolName(tool.custom.name)
      nameMap.set(sanitizedName, originalName)
      return {
        ...tool,
        custom: { ...tool.custom, name: sanitizedName }
      }
    }

    return tool
  })

  return { tools: sanitizedTools, nameMap }
}

/**
 * Prepare ALL enabled tools for context usage calculation
 * This loads all enabled integrations regardless of @mentions
 *
 * Uses 'any' type to avoid conflicts with Anthropic SDK's Tool type
 */
export async function prepareAllEnabledTools(
  integrationConfigs: Record<string, { enabled: boolean; envVars: Record<string, string> }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // Get all enabled integration IDs
  const enabledIds = Object.entries(integrationConfigs)
    .filter(([_, config]) => config.enabled)
    .map(([id]) => id)

  if (enabledIds.length === 0) return allTools

  try {
    // Use cached tools for performance
    const mcpTools = await getCachedMCPTools(enabledIds)
    const { tools: sanitizedTools } = sanitizeMCPTools(mcpTools)
    return [...allTools, ...sanitizedTools]
  } catch (e) {
    console.error('[chatUtils] Failed to load MCP tools for context calculation:', e)
    return allTools
  }
}

/**
 * Convert AttachedImages to ImageContent format for Claude API
 */
export function attachedImagesToImageContent(images: AttachedImage[]): Array<{
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}> {
  return images.map(img => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.data
    }
  }))
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
