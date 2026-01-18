import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const fileTools: Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path. Returns the file content as a string.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read. Can be absolute or relative to the workspace.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path. Creates the file if it does not exist, or overwrites if it does.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write to. Can be absolute or relative to the workspace.'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file.'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory. Returns an array of file and folder names with their types.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list. Can be absolute or relative to the workspace.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists at the specified path.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to check. Can be absolute or relative to the workspace.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a new directory at the specified path. Creates parent directories if they do not exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to create. Can be absolute or relative to the workspace.'
        }
      },
      required: ['path']
    }
  }
];

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a bash/shell command in the workspace directory. Returns stdout, stderr, and exit code. Use this for running scripts, git commands, npm commands, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute.'
      }
    },
    required: ['command']
  }
};

export const createIntegrationTool: Tool = {
  name: 'create_mcp_integration',
  description: 'Create a custom MCP integration. Use this when the user wants to add a new integration from a GitHub URL or npm package. The integration will be available in Settings and can be @mentioned in chat.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Display name for the integration (e.g., "GitHub", "Slack")'
      },
      description: {
        type: 'string',
        description: 'Brief description of what the integration does'
      },
      npmPackage: {
        type: 'string',
        description: 'NPM package name (e.g., "@anthropic-ai/mcp-server-github", "mcp-slack")'
      },
      mention: {
        type: 'string',
        description: 'Primary @mention to activate this integration (e.g., "@github"). Must start with @'
      },
      mentionAliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional alternative @mentions (e.g., ["@gh", "@repo"])'
      },
      category: {
        type: 'string',
        enum: ['browser', 'google', 'search', 'cloud', 'media', 'custom'],
        description: 'Category for the integration. Use "custom" if unsure.'
      },
      requiredEnvVars: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Environment variable name (e.g., "GITHUB_TOKEN")' },
            label: { type: 'string', description: 'Display label (e.g., "GitHub Token")' },
            type: { type: 'string', enum: ['apiKey', 'text'], description: 'Input type: apiKey (masked) or text (visible)' },
            description: { type: 'string', description: 'Help text for the user' }
          },
          required: ['key', 'label', 'type']
        },
        description: 'Environment variables the user needs to configure'
      },
      toolPrefix: {
        type: 'string',
        description: 'Prefix for tool names (e.g., "github_"). Should end with underscore.'
      },
      apiKeyUrl: {
        type: 'string',
        description: 'URL where user can get their API key (opens in browser)'
      },
      source: {
        type: 'string',
        description: 'GitHub URL or source reference for the integration'
      }
    },
    required: ['name', 'npmPackage', 'mention', 'toolPrefix']
  }
};

/**
 * Efficient tools for searching and editing without loading entire files into context
 */
export const efficientTools: Tool[] = [
  {
    name: 'grep',
    description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers. Much more efficient than reading entire files when searching for specific content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for (e.g., "function handleSubmit", "TODO:", "import.*from")'
        },
        path: {
          type: 'string',
          description: 'Directory or file to search in. Defaults to workspace root if not specified.'
        },
        include: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts", "*.tsx", "*.{js,jsx}")'
        },
        exclude: {
          type: 'string',
          description: 'Glob pattern to exclude files (e.g., "node_modules/**", "*.test.ts")'
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether the search is case-sensitive. Defaults to false.'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return. Defaults to 50.'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern. Returns file paths without reading contents. Use this to locate files before reading or editing them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match (e.g., "**/*.tsx", "src/**/*.test.ts", "*.md")'
        },
        cwd: {
          type: 'string',
          description: 'Directory to search from. Defaults to workspace root.'
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patterns to ignore (e.g., ["node_modules/**", "dist/**"])'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return. Defaults to 100.'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'edit',
    description: 'Edit a specific part of a file by replacing old text with new text. More efficient than read_file + write_file for targeted changes. The old_text must match exactly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The file path to edit. Can be absolute or relative to workspace.'
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace. Must match exactly including whitespace.'
        },
        new_text: {
          type: 'string',
          description: 'The text to replace old_text with. Can be empty to delete the text.'
        }
      },
      required: ['path', 'old_text', 'new_text']
    }
  }
];

/**
 * Task management tools for Supabase-synced tasks
 */
export const taskTools: Tool[] = [
  {
    name: 'create_task',
    description: 'Create a new task in the task management system. Tasks are synced to the cloud via Supabase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'The title/name of the task'
        },
        projectName: {
          type: 'string',
          description: 'The project this task belongs to (e.g., "Work", "Personal", "AssistantOS")'
        },
        description: {
          type: 'string',
          description: 'Optional detailed description of the task'
        },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in_progress', 'review', 'done'],
          description: 'Task status. Defaults to "todo" if not specified.'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Optional priority level'
        },
        dueDate: {
          type: 'string',
          description: 'Optional due date in YYYY-MM-DD format'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of tags for categorization'
        }
      },
      required: ['title', 'projectName']
    }
  },
  {
    name: 'update_task',
    description: 'Update an existing task by its ID. You can update any combination of fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the task to update'
        },
        title: {
          type: 'string',
          description: 'New title for the task'
        },
        description: {
          type: 'string',
          description: 'New description (set to empty string to clear)'
        },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in_progress', 'review', 'done'],
          description: 'New status for the task'
        },
        projectName: {
          type: 'string',
          description: 'Move task to a different project'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'New priority level (use null to clear)'
        },
        dueDate: {
          type: 'string',
          description: 'New due date in YYYY-MM-DD format (use null to clear)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace tags with this new array'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task by its ID. This action cannot be undone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the task to delete'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'get_task',
    description: 'Get details of a single task by its ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The UUID of the task to retrieve'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'list_tasks',
    description: 'List tasks with optional filters. Use this to show the user their tasks or find specific tasks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Filter by project name (case-insensitive)'
        },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in_progress', 'review', 'done'],
          description: 'Filter by status'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Filter by priority'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 50)'
        }
      },
      required: []
    }
  }
];

/**
 * Memory tool for saving user preferences to custom instructions
 */
export const rememberPreferenceTool: Tool = {
  name: 'remember_preference',
  description: 'Save a user preference to their custom instructions. Use this when the user says things like "always remember...", "from now on...", "I prefer...", "keep in mind that...", or explicitly asks you to remember something about their preferences. The preference will persist across all future conversations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      preference: {
        type: 'string',
        description: 'The preference to save, written as a clear instruction (e.g., "Always use TypeScript instead of JavaScript", "Prefer functional components over class components")'
      },
      category: {
        type: 'string',
        enum: ['coding', 'communication', 'workflow', 'general'],
        description: 'Category for organizing the preference. Use "coding" for programming preferences, "communication" for how you should respond, "workflow" for process preferences, "general" for everything else.'
      }
    },
    required: ['preference']
  }
};

export const allTools: Tool[] = [...fileTools, ...efficientTools, ...taskTools, bashTool, createIntegrationTool, rememberPreferenceTool];
