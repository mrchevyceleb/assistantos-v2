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

export const allTools: Tool[] = [...fileTools, bashTool];
