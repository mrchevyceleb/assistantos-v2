/**
 * Google OAuth Handler
 * Handles OAuth flow for Google integrations (Gmail, Calendar)
 * Uses system browser with localhost callback
 */

import { shell, BrowserWindow } from 'electron';
import * as http from 'http';
import * as url from 'url';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface OAuthResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

// Google token response shape
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Default OAuth configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_REDIRECT_PORT = 8547;

/**
 * Start the OAuth flow for a Google integration
 */
export async function startGoogleOAuth(
  config: OAuthConfig,
  mainWindow: BrowserWindow | null
): Promise<OAuthResult> {
  return new Promise((resolve) => {
    // Create local server to handle callback
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);

        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                  <h2 style="color: #ef4444;">Authentication Failed</h2>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            resolve({ success: false, error });
            return;
          }

          if (code) {
            try {
              // Exchange code for tokens
              const tokens = await exchangeCodeForTokens(code, config);

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h2 style="color: #22c55e;">Authentication Successful!</h2>
                    <p>You can close this window and return to AssistantOS.</p>
                    <script>window.close()</script>
                  </body>
                </html>
              `);

              server.close();

              // Focus the main window
              if (mainWindow) {
                mainWindow.focus();
              }

              resolve({ success: true, tokens });
            } catch (tokenError) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h2 style="color: #ef4444;">Token Exchange Failed</h2>
                    <p>Please try again.</p>
                    <p>You can close this window.</p>
                  </body>
                </html>
              `);
              server.close();
              resolve({
                success: false,
                error: tokenError instanceof Error ? tokenError.message : 'Token exchange failed'
              });
            }
          }
        }
      } catch (err) {
        console.error('[OAuth] Callback handler error:', err);
        res.writeHead(500);
        res.end('Internal error');
        server.close();
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Callback handler error'
        });
      }
    });

    // Start server on callback port
    server.listen(DEFAULT_REDIRECT_PORT, '127.0.0.1', () => {
      // Build OAuth URL
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      // Open in system browser
      shell.openExternal(authUrl.toString());

      console.log('[OAuth] Opened browser for authentication');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'OAuth timeout - please try again' });
    }, 5 * 60 * 1000);

    server.on('error', (err) => {
      console.error('[OAuth] Server error:', err);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig
): Promise<OAuthTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json() as GoogleTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshGoogleToken(
  refreshToken: string,
  config: Pick<OAuthConfig, 'clientId' | 'clientSecret'>
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json() as GoogleTokenResponse;

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Build the redirect URI for a given port
 */
export function getRedirectUri(port: number = DEFAULT_REDIRECT_PORT): string {
  return `http://127.0.0.1:${port}/callback`;
}

/**
 * Google OAuth scopes for different integrations
 */
export const GOOGLE_SCOPES = {
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
};
