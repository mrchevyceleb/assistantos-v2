/**
 * Task Parser Service Tests
 *
 * Tests for the task parsing functionality that reads markdown files
 * and extracts task data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { statusToChar, getTasksFolder, TASKS_FOLDER } from '@/services/taskParser'
import type { TaskStatus } from '@/types/task'

describe('taskParser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TASKS_FOLDER constant', () => {
    it('should be "TASKS"', () => {
      expect(TASKS_FOLDER).toBe('TASKS')
    })
  })

  describe('getTasksFolder', () => {
    it('should return custom folder when provided', () => {
      expect(getTasksFolder('/custom/path')).toBe('/custom/path')
      expect(getTasksFolder('C:\\custom\\tasks')).toBe('C:\\custom\\tasks')
    })

    it('should return default TASKS folder when custom is null', () => {
      expect(getTasksFolder(null)).toBe(TASKS_FOLDER)
    })

    it('should return default TASKS folder when custom is undefined', () => {
      expect(getTasksFolder(undefined)).toBe(TASKS_FOLDER)
    })

    it('should return default TASKS folder when custom is empty string', () => {
      // Empty string is falsy, so it should return default
      expect(getTasksFolder('')).toBe(TASKS_FOLDER)
    })
  })

  describe('statusToChar', () => {
    it('should return correct character for done status', () => {
      expect(statusToChar('done')).toBe('x')
    })

    it('should return correct character for in_progress status', () => {
      expect(statusToChar('in_progress')).toBe('>')
    })

    it('should return correct character for review status', () => {
      expect(statusToChar('review')).toBe('?')
    })

    it('should return correct character for todo status', () => {
      expect(statusToChar('todo')).toBe('o')
    })

    it('should return correct character for backlog status', () => {
      expect(statusToChar('backlog')).toBe(' ')
    })
  })

  describe('Task status mapping round-trip', () => {
    const statuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done']

    it.each(statuses)('should have consistent mapping for %s status', (status) => {
      const char = statusToChar(status)
      expect(char).toBeDefined()
      expect(typeof char).toBe('string')
      expect(char.length).toBe(1)
    })
  })
})

describe('Task filename convention', () => {
  // Test the regex pattern directly
  const FILENAME_TASK_REGEX = /^(.+?)\s*-\s*(.+?)\s*-\s*Due\s*(\d{4}-\d{2}-\d{2})(?:\s*\[([xXo>? ])\])?\.md$/i

  describe('valid task filenames', () => {
    it('should match basic task filename', () => {
      const filename = 'ProjectA - Task Title - Due 2026-01-15.md'
      const match = filename.match(FILENAME_TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[1]).toBe('ProjectA')
      expect(match?.[2]).toBe('Task Title')
      expect(match?.[3]).toBe('2026-01-15')
    })

    it('should match task filename with status', () => {
      const filename = 'ProjectB - Another Task - Due 2026-02-20 [>].md'
      const match = filename.match(FILENAME_TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[1]).toBe('ProjectB')
      expect(match?.[2]).toBe('Another Task')
      expect(match?.[3]).toBe('2026-02-20')
      expect(match?.[4]).toBe('>')
    })

    it('should handle extra spaces', () => {
      const filename = 'Project   -   Task   -   Due 2026-03-25.md'
      const match = filename.match(FILENAME_TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[1].trim()).toBe('Project')
      expect(match?.[2].trim()).toBe('Task')
    })
  })

  describe('invalid task filenames', () => {
    it('should not match README.md', () => {
      expect('README.md'.match(FILENAME_TASK_REGEX)).toBeNull()
    })

    it('should not match tasks.md', () => {
      expect('tasks.md'.match(FILENAME_TASK_REGEX)).toBeNull()
    })

    it('should not match filename without due date', () => {
      expect('Project - Task.md'.match(FILENAME_TASK_REGEX)).toBeNull()
    })

    it('should not match filename with invalid date format', () => {
      expect('Project - Task - Due 2026/01/15.md'.match(FILENAME_TASK_REGEX)).toBeNull()
    })

    it('should not match non-markdown files', () => {
      expect('Project - Task - Due 2026-01-15.txt'.match(FILENAME_TASK_REGEX)).toBeNull()
    })
  })
})

describe('Task checkbox syntax', () => {
  // Test the regex pattern directly
  const TASK_REGEX = /^(\s*)- \[([ xXo>?])\] (.+)$/

  describe('valid checkbox lines', () => {
    it('should match unchecked checkbox', () => {
      const line = '- [ ] Task text'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe(' ')
      expect(match?.[3]).toBe('Task text')
    })

    it('should match checked checkbox (lowercase x)', () => {
      const line = '- [x] Completed task'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe('x')
    })

    it('should match checked checkbox (uppercase X)', () => {
      const line = '- [X] Completed task'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe('X')
    })

    it('should match in-progress checkbox', () => {
      const line = '- [>] In progress'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe('>')
    })

    it('should match review checkbox', () => {
      const line = '- [?] Needs review'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe('?')
    })

    it('should match todo checkbox', () => {
      const line = '- [o] Todo item'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[2]).toBe('o')
    })

    it('should capture leading whitespace', () => {
      const line = '    - [ ] Indented task'
      const match = line.match(TASK_REGEX)
      expect(match).not.toBeNull()
      expect(match?.[1]).toBe('    ')
    })
  })

  describe('invalid checkbox lines', () => {
    it('should not match line without dash', () => {
      expect('[ ] Missing dash'.match(TASK_REGEX)).toBeNull()
    })

    it('should not match line without space after dash', () => {
      expect('-[ ] Missing space'.match(TASK_REGEX)).toBeNull()
    })

    it('should not match invalid checkbox character', () => {
      expect('- [!] Invalid char'.match(TASK_REGEX)).toBeNull()
    })

    it('should not match empty checkbox', () => {
      expect('- [] Empty'.match(TASK_REGEX)).toBeNull()
    })
  })
})
