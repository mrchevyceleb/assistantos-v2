import {
  Edit3,
  Trash2,
  Copy,
  FolderOpen,
  MessageSquare,
  FilePlus,
  FolderPlus
} from 'lucide-react'
import {
  ContextMenuContainer,
  MenuItem,
  MenuDivider
} from '../shared/ContextMenu'

interface FileContextMenuProps {
  x: number
  y: number
  path: string
  name: string
  isDirectory: boolean
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onSendToChat: () => void
  onNewFile?: () => void
  onNewFolder?: () => void
}

export function FileContextMenu({
  x,
  y,
  path,
  name,
  isDirectory,
  onClose,
  onRename,
  onDelete,
  onSendToChat,
  onNewFile,
  onNewFolder
}: FileContextMenuProps) {

  const handleCopyPath = async () => {
    if (window.electronAPI) {
      await window.electronAPI.fs.copyPath(path)
    }
    onClose()
  }

  const handleShowInExplorer = async () => {
    if (window.electronAPI) {
      await window.electronAPI.fs.showInExplorer(path)
    }
    onClose()
  }

  const handleRename = () => {
    onRename()
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  const handleSendToChat = () => {
    onSendToChat()
    onClose()
  }

  const handleNewFile = () => {
    onNewFile?.()
    onClose()
  }

  const handleNewFolder = () => {
    onNewFolder?.()
    onClose()
  }

  return (
    <ContextMenuContainer x={x} y={y} onClose={onClose} header={name} minWidth={200}>
      {/* Folder-specific actions */}
      {isDirectory && (
        <>
          <MenuItem
            icon={<FilePlus className="w-4 h-4" />}
            label="New File"
            onClick={handleNewFile}
          />
          <MenuItem
            icon={<FolderPlus className="w-4 h-4" />}
            label="New Folder"
            onClick={handleNewFolder}
          />
          <MenuDivider />
        </>
      )}

      {/* Common actions */}
      <MenuItem
        icon={<MessageSquare className="w-4 h-4" />}
        label="Send to Chat"
        onClick={handleSendToChat}
      />
      <MenuItem
        icon={<Copy className="w-4 h-4" />}
        label="Copy Path"
        onClick={handleCopyPath}
      />
      <MenuItem
        icon={<FolderOpen className="w-4 h-4" />}
        label="Show in Explorer"
        onClick={handleShowInExplorer}
      />

      <MenuDivider />

      <MenuItem
        icon={<Edit3 className="w-4 h-4" />}
        label="Rename"
        onClick={handleRename}
        shortcut="F2"
      />
      <MenuItem
        icon={<Trash2 className="w-4 h-4" />}
        label="Delete"
        onClick={handleDelete}
        variant="danger"
        shortcut="Del"
      />
    </ContextMenuContainer>
  )
}
