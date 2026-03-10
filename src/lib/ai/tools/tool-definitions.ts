import type { ToolDefinition } from '../types';

export const LOCAL_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files in a directory. Returns relative file paths.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from workspace root. Defaults to workspace root if omitted.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the file text content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from workspace root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search file contents for a text query. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text to search for.',
          },
          path: {
            type: 'string',
            description: 'Directory to search in, relative to workspace root. Defaults to workspace root.',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether the search should be case-sensitive. Defaults to false.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Get metadata about a file or directory including size, modification time, and type.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file or directory.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'directory_tree',
      description: 'Get a hierarchical directory tree structure showing files and subdirectories.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the directory. Defaults to workspace root.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new file or directory. Optionally provide initial content for files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path for the new file or directory.',
          },
          content: {
            type: 'string',
            description: 'Initial content for the file. Ignored if is_directory is true.',
          },
          is_directory: {
            type: 'boolean',
            description: 'If true, create a directory instead of a file. Defaults to false.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates the file if it does not exist, or overwrites it if it does.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file.',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_path',
      description: 'Delete a file or directory. Directories are deleted recursively.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file or directory to delete.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_path',
      description: 'Rename or move a file or directory.',
      parameters: {
        type: 'object',
        properties: {
          old_path: {
            type: 'string',
            description: 'Current relative path of the file or directory.',
          },
          new_path: {
            type: 'string',
            description: 'New relative path for the file or directory.',
          },
        },
        required: ['old_path', 'new_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute.',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command, relative to workspace root. Defaults to workspace root.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds. Defaults to 30000 (30 seconds).',
          },
        },
        required: ['command'],
      },
    },
  },
];

let dynamicToolDefinitions: ToolDefinition[] = [];

const SCHEMA_KEYS_TO_KEEP = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'oneOf',
  'anyOf',
  'allOf',
  'additionalProperties',
  'nullable',
  '$ref',
]);

function compactSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactSchema);
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(input)) {
      if (!SCHEMA_KEYS_TO_KEEP.has(key)) continue;

      if (key === 'properties' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const propsIn = raw as Record<string, unknown>;
        const propsOut: Record<string, unknown> = {};
        for (const [propName, propSchema] of Object.entries(propsIn)) {
          propsOut[propName] = compactSchema(propSchema);
        }
        out.properties = propsOut;
        continue;
      }

      out[key] = compactSchema(raw);
    }

    return out;
  }

  return value;
}

function compactToolDefinition(tool: ToolDefinition): ToolDefinition {
  if (tool.type !== 'function' || !tool.function) return tool;

  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: compactSchema(tool.function.parameters) as ToolDefinition['function']['parameters'],
    },
  };
}

export function setDynamicToolDefinitions(definitions: ToolDefinition[]) {
  dynamicToolDefinitions = definitions;
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return [...LOCAL_TOOL_DEFINITIONS, ...dynamicToolDefinitions].map(compactToolDefinition);
}

// Backward compatibility for existing imports.
export const TOOL_DEFINITIONS = LOCAL_TOOL_DEFINITIONS;

export const WRITE_TOOLS = new Set([
  'create_file',
  'write_file',
  'delete_path',
  'rename_path',
  'run_command',
]);
