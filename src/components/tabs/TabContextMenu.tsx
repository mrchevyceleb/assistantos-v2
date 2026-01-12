import { Edit3, Trash2 } from 'lucide-react'
import {
  ContextMenuContainer,
  MenuItem
} from '../shared/ContextMenu'

interface TabContextMenuProps {
  x: number
  y: number
  tabName: string
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}

export function TabContextMenu({
  x,
  y,
  tabName,
  onClose,
  onRename,
  onDelete
}: TabContextMenuProps) {

  const handleRename = () => {
    onRename()
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  return (
    <ContextMenuContainer x={x} y={y} onClose={onClose} header={tabName} minWidth={160}>
      <MenuItem
        icon={<Edit3 className="w-4 h-4" />}
        label="Rename"
        onClick={handleRename}
      />
      <MenuItem
        icon={<Trash2 className="w-4 h-4" />}
        label="Delete"
        onClick={handleDelete}
        variant="danger"
      />
    </ContextMenuContainer>
  )
}
