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

export const allTools: Tool[] = [...fileTools, bashTool, createIntegrationTool];
