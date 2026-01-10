/**
 * MCP Integration Registry
 * Single source of truth for all integration definitions including @mentions
 */

export interface MCPIntegration {
  id: string;
  name: string;
  description: string;
  mention: string;
  mentionAliases?: string[];
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media';
  command: string;
  args: string[];
  requiredEnvVars: Array<{
    key: string;
    label: string;
    type: 'apiKey' | 'oauth' | 'text';
    description?: string;
  }>;
  oauth?: {
    provider: 'google';
    scopes: string[];
  };
  toolPrefix: string;
}

export const MCP_INTEGRATIONS: MCPIntegration[] = [
  // Browser Integrations
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation for local web testing',
    mention: '@browser',
    mentionAliases: ['@playwright'],
    category: 'browser',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-playwright'],
    requiredEnvVars: [],
    toolPrefix: 'playwright_'
  },
  {
    id: 'browserbase',
    name: 'BrowserBase',
    description: 'Cloud browser automation',
    mention: '@cloud-browser',
    mentionAliases: ['@browserbase'],
    category: 'browser',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-browserbase'],
    requiredEnvVars: [
      { key: 'BROWSERBASE_API_KEY', label: 'API Key', type: 'apiKey', description: 'Your BrowserBase API key' },
      { key: 'BROWSERBASE_PROJECT_ID', label: 'Project ID', type: 'text', description: 'Your project ID' }
    ],
    toolPrefix: 'browserbase_'
  },

  // Google Integrations
  {
    id: 'gmail',
    name: 'Unified Gmail',
    description: 'Multi-account email access',
    mention: '@gmail',
    mentionAliases: ['@email', '@mail'],
    category: 'google',
    command: 'npx',
    args: ['-y', 'mcp-unified-gmail'],
    requiredEnvVars: [],
    oauth: {
      provider: 'google',
      scopes: ['https://mail.google.com/']
    },
    toolPrefix: 'gmail_'
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Calendar management and scheduling',
    mention: '@calendar',
    mentionAliases: ['@cal', '@schedule'],
    category: 'google',
    command: 'npx',
    args: ['-y', 'mcp-google-calendar'],
    requiredEnvVars: [],
    oauth: {
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar']
    },
    toolPrefix: 'calendar_'
  },

  // Search Integrations
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered web search and research',
    mention: '@perplexity',
    mentionAliases: ['@pplx', '@research'],
    category: 'search',
    command: 'npx',
    args: ['-y', 'mcp-perplexity'],
    requiredEnvVars: [
      { key: 'PERPLEXITY_API_KEY', label: 'API Key', type: 'apiKey', description: 'Your Perplexity API key' }
    ],
    toolPrefix: 'perplexity_'
  },
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'Privacy-focused web search',
    mention: '@brave',
    mentionAliases: ['@search', '@web'],
    category: 'search',
    command: 'npx',
    args: ['-y', 'mcp-brave-search'],
    requiredEnvVars: [
      { key: 'BRAVE_API_KEY', label: 'API Key', type: 'apiKey', description: 'Your Brave Search API key' }
    ],
    toolPrefix: 'brave_'
  },

  // Cloud Integrations
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deployment and project management',
    mention: '@vercel',
    mentionAliases: ['@deploy', '@hosting'],
    category: 'cloud',
    command: 'npx',
    args: ['-y', 'mcp-vercel'],
    requiredEnvVars: [
      { key: 'VERCEL_API_TOKEN', label: 'API Token', type: 'apiKey', description: 'Your Vercel API token' }
    ],
    toolPrefix: 'vercel_'
  },

  // Media Integrations
  {
    id: 'nanobanana',
    name: 'Nano Banana',
    description: 'AI image generation with Gemini',
    mention: '@image',
    mentionAliases: ['@img', '@generate', '@nanobanana'],
    category: 'media',
    command: 'npx',
    args: ['-y', 'mcp-nanobanana'],
    requiredEnvVars: [
      { key: 'GEMINI_API_KEY', label: 'Gemini API Key', type: 'apiKey', description: 'Your Google Gemini API key' }
    ],
    toolPrefix: 'image_'
  }
];

/**
 * Get integration by ID
 */
export function getIntegration(id: string): MCPIntegration | undefined {
  return MCP_INTEGRATIONS.find(int => int.id === id);
}

/**
 * Get integration by mention (including aliases)
 */
export function getIntegrationByMention(mention: string): MCPIntegration | undefined {
  const lowerMention = mention.toLowerCase();
  return MCP_INTEGRATIONS.find(int =>
    int.mention === lowerMention ||
    int.mentionAliases?.includes(lowerMention)
  );
}

/**
 * Auto-generate mention → integrationId map from registry
 */
export function getMentionMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const int of MCP_INTEGRATIONS) {
    map[int.mention] = int.id;
    for (const alias of int.mentionAliases || []) {
      map[alias] = int.id;
    }
  }
  return map;
}

/**
 * Get all mentions (primary + aliases) for autocomplete
 */
export function getAllMentions(): Array<{
  mention: string;
  integrationId: string;
  name: string;
  description: string;
  isPrimary: boolean;
}> {
  const mentions: Array<{
    mention: string;
    integrationId: string;
    name: string;
    description: string;
    isPrimary: boolean;
  }> = [];

  for (const int of MCP_INTEGRATIONS) {
    mentions.push({
      mention: int.mention,
      integrationId: int.id,
      name: int.name,
      description: int.description,
      isPrimary: true
    });

    for (const alias of int.mentionAliases || []) {
      mentions.push({
        mention: alias,
        integrationId: int.id,
        name: int.name,
        description: int.description,
        isPrimary: false
      });
    }
  }

  return mentions;
}

/**
 * Get integrations by category
 */
export function getIntegrationsByCategory(category: MCPIntegration['category']): MCPIntegration[] {
  return MCP_INTEGRATIONS.filter(int => int.category === category);
}

/**
 * Get all unique categories
 */
export function getCategories(): MCPIntegration['category'][] {
  return [...new Set(MCP_INTEGRATIONS.map(int => int.category))];
}
