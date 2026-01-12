import {
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link
} from 'lucide-react'
import {
  ContextMenuContainer,
  MenuItem,
  MenuDivider
} from '../shared/ContextMenu'

interface EditorContextMenuProps {
  x: number
  y: number
  onClose: () => void
  // Clipboard actions
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onSelectAll: () => void
  // Formatting actions
  onBold: () => void
  onItalic: () => void
  onStrikethrough: () => void
  onCode: () => void
  onInsertLink: () => void
  // State
  hasSelection: boolean
}

export function EditorContextMenu({
  x,
  y,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onBold,
  onItalic,
  onStrikethrough,
  onCode,
  onInsertLink,
  hasSelection
}: EditorContextMenuProps) {

  const handleCut = () => {
    onCut()
    onClose()
  }

  const handleCopy = () => {
    onCopy()
    onClose()
  }

  const handlePaste = () => {
    onPaste()
    onClose()
  }

  const handleSelectAll = () => {
    onSelectAll()
    onClose()
  }

  const handleBold = () => {
    onBold()
    onClose()
  }

  const handleItalic = () => {
    onItalic()
    onClose()
  }

  const handleStrikethrough = () => {
    onStrikethrough()
    onClose()
  }

  const handleCode = () => {
    onCode()
    onClose()
  }

  const handleInsertLink = () => {
    onInsertLink()
    onClose()
  }

  return (
    <ContextMenuContainer x={x} y={y} onClose={onClose} header="Edit" minWidth={180}>
      {/* Clipboard actions */}
      <MenuItem
        icon={<Scissors className="w-4 h-4" />}
        label="Cut"
        onClick={handleCut}
        shortcut="Ctrl+X"
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<Copy className="w-4 h-4" />}
        label="Copy"
        onClick={handleCopy}
        shortcut="Ctrl+C"
        disabled={!hasSelection}
      />
      <MenuItem
        icon={<ClipboardPaste className="w-4 h-4" />}
        label="Paste"
        onClick={handlePaste}
        shortcut="Ctrl+V"
      />
      <MenuItem
        icon={<TextSelect className="w-4 h-4" />}
        label="Select All"
        onClick={handleSelectAll}
        shortcut="Ctrl+A"
      />

      <MenuDivider />

      {/* Formatting actions */}
      <MenuItem
        icon={<Bold className="w-4 h-4" />}
        label="Bold"
        onClick={handleBold}
        shortcut="Ctrl+B"
      />
      <MenuItem
        icon={<Italic className="w-4 h-4" />}
        label="Italic"
        onClick={handleItalic}
        shortcut="Ctrl+I"
      />
      <MenuItem
        icon={<Strikethrough className="w-4 h-4" />}
        label="Strikethrough"
        onClick={handleStrikethrough}
        shortcut="Ctrl+Shift+S"
      />
      <MenuItem
        icon={<Code className="w-4 h-4" />}
        label="Code"
        onClick={handleCode}
        shortcut="Ctrl+`"
      />

      <MenuDivider />

      {/* Insert actions */}
      <MenuItem
        icon={<Link className="w-4 h-4" />}
        label="Insert Link"
        onClick={handleInsertLink}
        shortcut="Ctrl+K"
      />
    </ContextMenuContainer>
  )
}
