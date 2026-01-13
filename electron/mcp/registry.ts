/**
 * MCP Integration Registry
 * Single source of truth for all integration definitions including @mentions
 */

import {
  GOOGLE_OAUTH_CREDENTIALS,
  hasEmbeddedCredentials,
  GOOGLE_OAUTH_SCOPES
} from '../config/googleOAuth.js';

export interface MCPIntegration {
  id: string;
  name: string;
  description: string;
  mention: string;
  mentionAliases?: string[];
  category: 'browser' | 'google' | 'search' | 'cloud' | 'media' | 'custom';
  command: string;
  args: string[];
  requiredEnvVars: Array<{
    key: string;
    label: string;
    type: 'apiKey' | 'oauth' | 'text';
    description?: string;
    defaultValue?: string;
  }>;
  oauth?: {
    provider: 'google';
    scopes: string[];
  };
  toolPrefix: string;
  apiKeyUrl?: string;
  isCustom?: boolean;
  source?: string;
  isGmailAccount?: boolean;       // Flag for Gmail account integrations
  gmailAccountId?: string;        // Reference to GmailAccount.id
}

export const MCP_INTEGRATIONS: MCPIntegration[] = [
  // Browser Integrations
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation for local web testing (Microsoft official)',
    mention: '@browser',
    mentionAliases: ['@playwright'],
    category: 'browser',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    requiredEnvVars: [],
    toolPrefix: 'browser_'
  },
  {
    id: 'browserbase',
    name: 'BrowserBase',
    description: 'Cloud browser automation with Stagehand AI',
    mention: '@cloud-browser',
    mentionAliases: ['@browserbase', '@stagehand'],
    category: 'browser',
    command: 'npx',
    args: ['-y', '@browserbasehq/mcp-server-browserbase'],
    requiredEnvVars: [
      { key: 'BROWSERBASE_API_KEY', label: 'BrowserBase API Key', type: 'apiKey', description: 'Your BrowserBase API key' },
      { key: 'BROWSERBASE_PROJECT_ID', label: 'Project ID', type: 'text', description: 'Your BrowserBase project ID' },
      { key: 'GEMINI_API_KEY', label: 'Gemini API Key', type: 'apiKey', description: 'Gemini API key for Stagehand vision' }
    ],
    apiKeyUrl: 'https://www.browserbase.com/settings',
    toolPrefix: 'browserbase_'
  },

  // Google Integrations
  // Note: These use embedded OAuth credentials when available
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email access with auto-authentication',
    mention: '@gmail',
    mentionAliases: ['@email', '@mail'],
    category: 'google',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    // Use embedded credentials if available, otherwise require user to configure
    requiredEnvVars: hasEmbeddedCredentials() ? [] : [
      { key: 'GMAIL_CLIENT_ID', label: 'Google Client ID', type: 'text', description: 'OAuth client ID from Google Cloud Console' },
      { key: 'GMAIL_CLIENT_SECRET', label: 'Google Client Secret', type: 'apiKey', description: 'OAuth client secret' }
    ],
    oauth: hasEmbeddedCredentials() ? {
      provider: 'google',
      scopes: GOOGLE_OAUTH_SCOPES.gmail
    } : undefined,
    apiKeyUrl: 'https://console.cloud.google.com/apis/credentials',
    toolPrefix: 'gmail_'
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Calendar management with multi-account support',
    mention: '@calendar',
    mentionAliases: ['@cal', '@schedule'],
    category: 'google',
    command: 'npx',
    args: ['-y', '@cocal/google-calendar-mcp'],
    // Use embedded credentials if available, otherwise require user to configure
    requiredEnvVars: hasEmbeddedCredentials() ? [] : [
      { key: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', type: 'text', description: 'OAuth client ID from Google Cloud Console' },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', type: 'apiKey', description: 'OAuth client secret' }
    ],
    oauth: hasEmbeddedCredentials() ? {
      provider: 'google',
      scopes: GOOGLE_OAUTH_SCOPES.calendar
    } : undefined,
    apiKeyUrl: 'https://console.cloud.google.com/apis/credentials',
    toolPrefix: 'calendar_'
  },

  // Search Integrations
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered web search, research, and reasoning',
    mention: '@perplexity',
    mentionAliases: ['@pplx', '@research'],
    category: 'search',
    command: 'npx',
    args: ['-y', '@perplexity-ai/mcp-server'],
    requiredEnvVars: [
      { key: 'PERPLEXITY_API_KEY', label: 'API Key', type: 'apiKey', description: 'Your Perplexity API key' }
    ],
    apiKeyUrl: 'https://www.perplexity.ai/settings/api',
    toolPrefix: 'perplexity_'
  },
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'Privacy-focused web, image, video, and news search',
    mention: '@brave',
    mentionAliases: ['@search', '@web'],
    category: 'search',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server'],
    requiredEnvVars: [
      { key: 'BRAVE_API_KEY', label: 'API Key', type: 'apiKey', description: 'Your Brave Search API key' }
    ],
    apiKeyUrl: 'https://brave.com/search/api/',
    toolPrefix: 'brave_'
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date documentation for any library',
    mention: '@docs',
    mentionAliases: ['@context7', '@documentation'],
    category: 'search',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    requiredEnvVars: [],
    toolPrefix: 'context7_'
  },

  // Cloud Integrations
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deployment, DNS, domains, and project management',
    mention: '@vercel',
    mentionAliases: ['@deploy', '@hosting'],
    category: 'cloud',
    command: 'npx',
    args: ['-y', '@open-mcp/vercel'],
    requiredEnvVars: [
      { key: 'VERCEL_API_TOKEN', label: 'API Token', type: 'apiKey', description: 'Your Vercel API token' }
    ],
    apiKeyUrl: 'https://vercel.com/account/tokens',
    toolPrefix: 'vercel_'
  },

  // Media Integrations
  {
    id: 'nanobanana',
    name: 'Nano Banana',
    description: 'AI image generation with Gemini 3 Pro',
    mention: '@image',
    mentionAliases: ['@img', '@generate', '@nanobanana'],
    category: 'media',
    command: 'npx',
    args: ['-y', 'gemini-nanobanana-mcp@latest'],
    requiredEnvVars: [
      { key: 'GEMINI_API_KEY', label: 'Gemini API Key', type: 'apiKey', description: 'Your Google Gemini API key' },
      { key: 'NANOBANANA_MODEL', label: 'Model', type: 'text', description: 'Gemini model to use', defaultValue: 'gemini-3-pro-image-preview' }
    ],
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    toolPrefix: 'nanobanana_'
  }
];

// Custom integrations storage (mutable)
let customIntegrations: MCPIntegration[] = [];

/**
 * Get all integrations (built-in + custom)
 */
export function getAllIntegrations(): MCPIntegration[] {
  return [...MCP_INTEGRATIONS, ...customIntegrations];
}

/**
 * Get integration by ID (searches both built-in and custom)
 */
export function getIntegration(id: string): MCPIntegration | undefined {
  return getAllIntegrations().find(int => int.id === id);
}

/**
 * Get integration by mention (including aliases)
 */
export function getIntegrationByMention(mention: string): MCPIntegration | undefined {
  const lowerMention = mention.toLowerCase();
  return getAllIntegrations().find(int =>
    int.mention === lowerMention ||
    int.mentionAliases?.includes(lowerMention)
  );
}

/**
 * Auto-generate mention → integrationId map from registry
 */
export function getMentionMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const int of getAllIntegrations()) {
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

  for (const int of getAllIntegrations()) {
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
  return getAllIntegrations().filter(int => int.category === category);
}

/**
 * Get all unique categories
 */
export function getCategories(): MCPIntegration['category'][] {
  return [...new Set(getAllIntegrations().map(int => int.category))];
}

/**
 * Get custom integrations only
 */
export function getCustomIntegrations(): MCPIntegration[] {
  return [...customIntegrations];
}

/**
 * Register a custom integration
 * Returns true if successful, false if ID or mention already exists
 */
export function registerCustomIntegration(integration: MCPIntegration): { success: boolean; error?: string } {
  // Validate unique ID
  if (getIntegration(integration.id)) {
    return { success: false, error: `Integration with ID "${integration.id}" already exists` };
  }

  // Validate unique mention
  const mentionLower = integration.mention.toLowerCase();
  if (getIntegrationByMention(mentionLower)) {
    return { success: false, error: `Integration with mention "${integration.mention}" already exists` };
  }

  // Validate aliases don't conflict
  for (const alias of integration.mentionAliases || []) {
    if (getIntegrationByMention(alias.toLowerCase())) {
      return { success: false, error: `Integration with mention "${alias}" already exists` };
    }
  }

  // Mark as custom
  const customIntegration: MCPIntegration = {
    ...integration,
    isCustom: true,
    category: integration.category || 'custom'
  };

  customIntegrations.push(customIntegration);
  return { success: true };
}

/**
 * Unregister a custom integration
 */
export function unregisterCustomIntegration(id: string): { success: boolean; error?: string } {
  const index = customIntegrations.findIndex(int => int.id === id);
  if (index === -1) {
    // Check if it's a built-in
    if (MCP_INTEGRATIONS.find(int => int.id === id)) {
      return { success: false, error: 'Cannot remove built-in integrations' };
    }
    return { success: false, error: `Custom integration "${id}" not found` };
  }

  customIntegrations.splice(index, 1);
  return { success: true };
}

/**
 * Update a custom integration
 */
export function updateCustomIntegration(id: string, updates: Partial<MCPIntegration>): { success: boolean; error?: string } {
  const index = customIntegrations.findIndex(int => int.id === id);
  if (index === -1) {
    return { success: false, error: `Custom integration "${id}" not found` };
  }

  // Validate mention uniqueness if changing mention
  if (updates.mention) {
    const mentionLower = updates.mention.toLowerCase();
    const existing = getIntegrationByMention(mentionLower);
    if (existing && existing.id !== id) {
      return { success: false, error: `Integration with mention "${updates.mention}" already exists` };
    }
  }

  // Apply updates
  customIntegrations[index] = {
    ...customIntegrations[index],
    ...updates,
    id, // Preserve original ID
    isCustom: true // Preserve custom flag
  };

  return { success: true };
}

/**
 * Load custom integrations from persistence
 */
export function loadCustomIntegrations(integrations: MCPIntegration[]): void {
  customIntegrations = integrations.map(int => ({
    ...int,
    isCustom: true,
    category: int.category || 'custom'
  }));
}

/**
 * Clear all custom integrations
 */
export function clearCustomIntegrations(): void {
  customIntegrations = [];
}

/**
 * Create a virtual Gmail account integration
 * Each Gmail account runs as a separate MCP server instance
 */
export function createGmailAccountIntegration(
  accountId: string,
  label: string,
  email: string
): MCPIntegration {
  const sanitizedLabel = label.toLowerCase().replace(/\s+/g, '-');

  return {
    id: `gmail-${accountId}`,
    name: `Gmail (${label})`,
    description: `Gmail access for ${email}`,
    mention: `@gmail-${sanitizedLabel}`,
    mentionAliases: [],
    category: 'google',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    requiredEnvVars: [],
    oauth: hasEmbeddedCredentials() ? {
      provider: 'google',
      scopes: GOOGLE_OAUTH_SCOPES.gmail
    } : undefined,
    // IMPORTANT: Gmail MCP server generates tool names using the email address
    // e.g., gmail_user@example.com_search_emails
    // So we must use the email (not the user label) as the prefix
    toolPrefix: `gmail_${email}_`,
    isCustom: false,
    isGmailAccount: true,
    gmailAccountId: accountId
  };
}
