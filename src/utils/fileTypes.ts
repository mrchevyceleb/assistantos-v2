// File type detection utilities

// Supported file extensions by category
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg'])
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi'])
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a'])
export const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
export const TEXT_EXTENSIONS = new Set(['.txt', '.json', '.yaml', '.yml', '.xml', '.csv', '.log', '.ini', '.conf'])
export const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.swift', '.kt', '.scala', '.lua', '.sh', '.bash', '.zsh', '.ps1', '.sql',
  '.html', '.css', '.scss', '.sass', '.less'
])

// All media extensions combined
export const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS])

// Get file extension (lowercase, with dot)
export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filePath.slice(lastDot).toLowerCase()
}

// File type detection functions
export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filePath))
}

export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(getFileExtension(filePath))
}

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(getFileExtension(filePath))
}

export function isMediaFile(filePath: string): boolean {
  return MEDIA_EXTENSIONS.has(getFileExtension(filePath))
}

export function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(getFileExtension(filePath))
}

export function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(getFileExtension(filePath))
}

export function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(getFileExtension(filePath))
}

// Check if file can be edited as text in the markdown editor
// For now, we allow markdown, text, and code files
export function isEditableTextFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return MARKDOWN_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext)
}

// Get media type for HTML elements
export type MediaType = 'image' | 'video' | 'audio' | 'unknown'

export function getMediaType(filePath: string): MediaType {
  if (isImageFile(filePath)) return 'image'
  if (isVideoFile(filePath)) return 'video'
  if (isAudioFile(filePath)) return 'audio'
  return 'unknown'
}

// Get MIME type for media files
export function getMimeType(filePath: string): string {
  const ext = getFileExtension(filePath)

  const mimeTypes: Record<string, string> = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    // Videos
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const base = 1024
  const exponent = Math.floor(Math.log(bytes) / Math.log(base))
  const value = bytes / Math.pow(base, exponent)

  return `${value.toFixed(exponent > 0 ? 1 : 0)} ${units[exponent]}`
}
