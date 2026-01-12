import {
  Copy,
  Code,
  RefreshCw,
  Trash2
} from 'lucide-react'
import {
  ContextMenuContainer,
  MenuItem,
  MenuDivider
} from '../shared/ContextMenu'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
}

interface ChatMessageContextMenuProps {
  x: number
  y: number
  message: Message
  onClose: () => void
  onCopyText: () => void
  onCopyCode: () => void
  onResend: () => void
  onDelete: () => void
}

/**
 * Extract code blocks from markdown content
 */
function extractCodeBlocks(content: string): string[] {
  const regex = /```(?:\w+)?\n?([\s\S]*?)```/g
  const blocks: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

/**
 * Check if content has code blocks
 */
function hasCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```/.test(content)
}

export function ChatMessageContextMenu({
  x,
  y,
  message,
  onClose,
  onCopyText,
  onCopyCode,
  onResend,
  onDelete
}: ChatMessageContextMenuProps) {
  const isUserMessage = message.role === 'user'
  const hasCode = hasCodeBlocks(message.content)

  const handleCopyText = () => {
    onCopyText()
    onClose()
  }

  const handleCopyCode = () => {
    onCopyCode()
    onClose()
  }

  const handleResend = () => {
    onResend()
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  return (
    <ContextMenuContainer
      x={x}
      y={y}
      onClose={onClose}
      header={isUserMessage ? 'Your Message' : 'Assistant'}
      minWidth={180}
    >
      <MenuItem
        icon={<Copy className="w-4 h-4" />}
        label="Copy Text"
        onClick={handleCopyText}
      />
      {hasCode && (
        <MenuItem
          icon={<Code className="w-4 h-4" />}
          label="Copy Code"
          onClick={handleCopyCode}
        />
      )}

      {isUserMessage && (
        <>
          <MenuDivider />
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            label="Re-send"
            onClick={handleResend}
          />
        </>
      )}

      <MenuDivider />

      <MenuItem
        icon={<Trash2 className="w-4 h-4" />}
        label="Delete"
        onClick={handleDelete}
        variant="danger"
      />
    </ContextMenuContainer>
  )
}

export { extractCodeBlocks, hasCodeBlocks }
