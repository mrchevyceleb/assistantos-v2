/**
 * Google OAuth Credentials Configuration
 *
 * These are the embedded OAuth credentials for AssistantOS.
 * Users no longer need to configure their own Google Cloud credentials.
 *
 * IMPORTANT: These credentials are specifically registered for AssistantOS
 * and should not be used in other applications.
 *
 * OAuth Setup:
 * 1. Project: AssistantOS (Google Cloud Console)
 * 2. OAuth consent screen: External, Published
 * 3. Authorized redirect URIs: http://127.0.0.1:8547/callback
 * 4. Scopes: Gmail and Calendar APIs
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
}

/**
 * Embedded Google OAuth credentials for AssistantOS
 *
 * NOTE: For production, these should be replaced with actual registered
 * OAuth credentials from Google Cloud Console. The placeholder values below
 * indicate where to place the real credentials.
 *
 * To set up real credentials:
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create a new OAuth 2.0 Client ID (Desktop app)
 * 3. Add authorized redirect URI: http://127.0.0.1:8547/callback
 * 4. Enable Gmail API and Google Calendar API
 * 5. Replace the values below with your credentials
 */
export const GOOGLE_OAUTH_CREDENTIALS: GoogleOAuthConfig = {
  // Embedded credentials for AssistantOS - users don't need to configure their own
  clientId: '822918904752-htmnn3lbfc4bl79rkh3h1nq84caber5m.apps.googleusercontent.com',
  clientSecret: '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',
  redirectPort: 8547
};

/**
 * Check if embedded credentials are configured
 */
export function hasEmbeddedCredentials(): boolean {
  return !!(GOOGLE_OAUTH_CREDENTIALS.clientId && GOOGLE_OAUTH_CREDENTIALS.clientSecret);
}

/**
 * Get OAuth redirect URI
 */
export function getOAuthRedirectUri(): string {
  return `http://127.0.0.1:${GOOGLE_OAUTH_CREDENTIALS.redirectPort}/callback`;
}

/**
 * Google OAuth scopes for different services
 */
export const GOOGLE_OAUTH_SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  // Combined scopes for multi-service authorization
  all: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ]
};

/**
 * Instructions for users who want to use their own credentials
 * (displayed in settings when embedded credentials are not available)
 */
export const CUSTOM_CREDENTIALS_INSTRUCTIONS = `
To use Gmail and Calendar integrations, you need to set up Google OAuth credentials:

1. Go to Google Cloud Console (https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Gmail API and Google Calendar API
4. Go to APIs & Services > Credentials
5. Create an OAuth 2.0 Client ID (Application type: Desktop app)
6. Add authorized redirect URI: http://127.0.0.1:8547/callback
7. Copy the Client ID and Client Secret below

Note: You may need to add yourself as a test user if the app is in testing mode.
`.trim();
