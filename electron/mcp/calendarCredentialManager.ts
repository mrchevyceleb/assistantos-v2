/**
 * Calendar Credential Manager
 * Manages credential files for Google Calendar MCP server
 *
 * The @cocal/google-calendar-mcp server expects:
 * - GOOGLE_OAUTH_CREDENTIALS: Path to GCP OAuth keys JSON (client_id, client_secret)
 * - Tokens stored at: ~/.config/google-calendar-mcp/tokens.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GOOGLE_OAUTH_CREDENTIALS } from '../config/googleOAuth.js';

export interface CalendarOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Directory for Calendar MCP OAuth keys file
 */
function getOAuthKeysDir(): string {
  const baseDir = path.join(os.homedir(), '.calendar-mcp');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Directory for Calendar MCP token storage
 * Uses XDG Base Directory: ~/.config/google-calendar-mcp/
 */
function getTokenDir(): string {
  const baseDir = path.join(os.homedir(), '.config', 'google-calendar-mcp');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Write OAuth client credentials file (gcp-oauth.keys.json)
 * This contains the client_id and client_secret from Google Cloud Console
 */
export function writeOAuthKeysFile(): string {
  const oauthDir = getOAuthKeysDir();
  const oauthKeysPath = path.join(oauthDir, 'gcp-oauth.keys.json');

  // Format expected by Calendar MCP server
  const oauthKeys = {
    installed: {
      client_id: GOOGLE_OAUTH_CREDENTIALS.clientId,
      client_secret: GOOGLE_OAUTH_CREDENTIALS.clientSecret,
      redirect_uris: [`http://127.0.0.1:${GOOGLE_OAUTH_CREDENTIALS.redirectPort}/callback`]
    }
  };

  fs.writeFileSync(oauthKeysPath, JSON.stringify(oauthKeys, null, 2), 'utf8');
  console.log(`[Calendar] Wrote OAuth keys file: ${oauthKeysPath}`);

  return oauthKeysPath;
}

/**
 * Write tokens file (tokens.json)
 * This contains the access_token and refresh_token from OAuth flow
 * Stored at ~/.config/google-calendar-mcp/tokens.json
 */
export function writeTokensFile(tokens: CalendarOAuthTokens): string {
  const tokenDir = getTokenDir();
  const tokensPath = path.join(tokenDir, 'tokens.json');

  // Format expected by Calendar MCP server
  const tokenData = {
    type: 'authorized_user',
    client_id: GOOGLE_OAUTH_CREDENTIALS.clientId,
    client_secret: GOOGLE_OAUTH_CREDENTIALS.clientSecret,
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.expiresAt
  };

  fs.writeFileSync(tokensPath, JSON.stringify(tokenData, null, 2), 'utf8');
  console.log(`[Calendar] Wrote tokens file: ${tokensPath}`);

  return tokensPath;
}

/**
 * Get environment variables for Calendar MCP server
 * Returns the file path that the server expects
 */
export function getCalendarEnvVars(tokens: CalendarOAuthTokens): Record<string, string> {
  // Write credential files
  const oauthKeysPath = writeOAuthKeysFile();
  writeTokensFile(tokens);

  // Return env var pointing to the OAuth keys file
  return {
    GOOGLE_OAUTH_CREDENTIALS: oauthKeysPath
  };
}

/**
 * Update tokens file with refreshed tokens
 */
export function updateTokensFile(tokens: CalendarOAuthTokens): void {
  const tokenDir = getTokenDir();
  const tokensPath = path.join(tokenDir, 'tokens.json');

  if (!fs.existsSync(tokensPath)) {
    console.warn(`[Calendar] Tokens file not found, creating new one`);
    writeTokensFile(tokens);
    return;
  }

  // Read existing file to preserve any additional fields
  let tokenData: Record<string, unknown>;
  try {
    tokenData = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  } catch (error) {
    console.error(`[Calendar] Failed to read tokens file, creating new one:`, error);
    writeTokensFile(tokens);
    return;
  }

  // Update tokens
  tokenData.access_token = tokens.accessToken;
  tokenData.refresh_token = tokens.refreshToken;
  tokenData.expiry_date = tokens.expiresAt;

  fs.writeFileSync(tokensPath, JSON.stringify(tokenData, null, 2), 'utf8');
  console.log(`[Calendar] Updated tokens file: ${tokensPath}`);
}

/**
 * Clean up credential files
 */
export function cleanupCredentialFiles(): void {
  const oauthDir = getOAuthKeysDir();
  const tokenDir = getTokenDir();

  // Clean OAuth keys
  if (fs.existsSync(oauthDir)) {
    try {
      const files = fs.readdirSync(oauthDir);
      for (const file of files) {
        fs.unlinkSync(path.join(oauthDir, file));
      }
      fs.rmdirSync(oauthDir);
      console.log(`[Calendar] Cleaned up OAuth keys directory`);
    } catch (error) {
      console.error(`[Calendar] Failed to cleanup OAuth keys:`, error);
    }
  }

  // Clean tokens
  if (fs.existsSync(tokenDir)) {
    try {
      const tokensPath = path.join(tokenDir, 'tokens.json');
      if (fs.existsSync(tokensPath)) {
        fs.unlinkSync(tokensPath);
      }
      console.log(`[Calendar] Cleaned up tokens file`);
    } catch (error) {
      console.error(`[Calendar] Failed to cleanup tokens:`, error);
    }
  }
}

/**
 * Check if credential files exist
 */
export function credentialFilesExist(): boolean {
  const oauthDir = getOAuthKeysDir();
  const tokenDir = getTokenDir();
  const oauthKeysPath = path.join(oauthDir, 'gcp-oauth.keys.json');
  const tokensPath = path.join(tokenDir, 'tokens.json');

  return fs.existsSync(oauthKeysPath) && fs.existsSync(tokensPath);
}
