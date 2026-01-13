/**
 * Gmail Credential Manager
 * Manages credential files for Gmail MCP server
 *
 * The @gongrzhe/server-gmail-autoauth-mcp server expects credentials as FILES, not env vars:
 * - GMAIL_OAUTH_PATH: Path to GCP OAuth keys JSON (client_id, client_secret)
 * - GMAIL_CREDENTIALS_PATH: Path to credentials JSON (refresh_token, access_token)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GOOGLE_OAUTH_CREDENTIALS } from '../config/googleOAuth.js';

export interface GmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Directory for Gmail MCP credential files
 * Uses account-specific subdirectories to avoid conflicts between multiple accounts
 *
 * For base 'gmail' account: ~/.gmail-mcp/
 * For additional accounts: ~/.gmail-mcp/gmail-{accountId}/
 */
function getCredentialDir(accountId: string): string {
  // Base directory
  const homeDir = os.homedir();

  // For base 'gmail' integration, use ~/.gmail-mcp directly (backward compatibility)
  // For account-specific integrations (gmail-{id}), use subdirectory
  let credentialDir: string;
  if (accountId === 'gmail') {
    credentialDir = path.join(homeDir, '.gmail-mcp');
  } else {
    // Account-specific subdirectory to avoid conflicts
    credentialDir = path.join(homeDir, '.gmail-mcp', accountId);
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(credentialDir)) {
    fs.mkdirSync(credentialDir, { recursive: true });
    console.log(`[Gmail] Created credential directory: ${credentialDir}`);
  }

  return credentialDir;
}

/**
 * Write OAuth client credentials file (gcp-oauth.keys.json)
 * This contains the client_id and client_secret from Google Cloud Console
 */
export function writeOAuthKeysFile(accountId: string): string {
  const credentialDir = getCredentialDir(accountId);
  const oauthKeysPath = path.join(credentialDir, 'gcp-oauth.keys.json');

  // Format expected by Gmail MCP server
  const oauthKeys = {
    installed: {
      client_id: GOOGLE_OAUTH_CREDENTIALS.clientId,
      client_secret: GOOGLE_OAUTH_CREDENTIALS.clientSecret,
      redirect_uris: [`http://127.0.0.1:${GOOGLE_OAUTH_CREDENTIALS.redirectPort}/callback`]
    }
  };

  fs.writeFileSync(oauthKeysPath, JSON.stringify(oauthKeys, null, 2), 'utf8');
  console.log(`[Gmail] Wrote OAuth keys file: ${oauthKeysPath}`);

  return oauthKeysPath;
}

/**
 * Write credentials file (credentials.json)
 * This contains the access_token and refresh_token from OAuth flow
 */
export function writeCredentialsFile(accountId: string, tokens: GmailOAuthTokens): string {
  const credentialDir = getCredentialDir(accountId);
  const credentialsPath = path.join(credentialDir, 'credentials.json');

  // Format expected by Gmail MCP server
  const credentials = {
    type: 'authorized_user',
    client_id: GOOGLE_OAUTH_CREDENTIALS.clientId,
    client_secret: GOOGLE_OAUTH_CREDENTIALS.clientSecret,
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.expiresAt
  };

  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), 'utf8');
  console.log(`[Gmail] Wrote credentials file: ${credentialsPath}`);

  return credentialsPath;
}

/**
 * Get environment variables for Gmail MCP server
 * Returns the file paths that the server expects
 */
export function getGmailEnvVars(accountId: string, tokens: GmailOAuthTokens): Record<string, string> {
  // Write credential files
  const oauthKeysPath = writeOAuthKeysFile(accountId);
  const credentialsPath = writeCredentialsFile(accountId, tokens);

  // Return env vars pointing to the files
  return {
    GMAIL_OAUTH_PATH: oauthKeysPath,
    GMAIL_CREDENTIALS_PATH: credentialsPath
  };
}

/**
 * Update credentials file with refreshed tokens
 */
export function updateCredentialsFile(accountId: string, tokens: GmailOAuthTokens): void {
  const credentialDir = getCredentialDir(accountId);
  const credentialsPath = path.join(credentialDir, 'credentials.json');

  if (!fs.existsSync(credentialsPath)) {
    console.warn(`[Gmail] Credentials file not found for ${accountId}, creating new one`);
    writeCredentialsFile(accountId, tokens);
    return;
  }

  // Read existing file to preserve any additional fields
  let credentials: any;
  try {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  } catch (error) {
    console.error(`[Gmail] Failed to read credentials file, creating new one:`, error);
    writeCredentialsFile(accountId, tokens);
    return;
  }

  // Update tokens
  credentials.access_token = tokens.accessToken;
  credentials.refresh_token = tokens.refreshToken;
  credentials.expiry_date = tokens.expiresAt;

  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), 'utf8');
  console.log(`[Gmail] Updated credentials file: ${credentialsPath}`);
}

/**
 * Clean up credential files for an account
 */
export function cleanupCredentialFiles(accountId: string): void {
  const credentialDir = getCredentialDir(accountId);

  if (fs.existsSync(credentialDir)) {
    try {
      // Remove all files in the directory
      const files = fs.readdirSync(credentialDir);
      for (const file of files) {
        fs.unlinkSync(path.join(credentialDir, file));
      }

      // Remove the directory
      fs.rmdirSync(credentialDir);
      console.log(`[Gmail] Cleaned up credentials for ${accountId}`);
    } catch (error) {
      console.error(`[Gmail] Failed to cleanup credentials:`, error);
    }
  }
}

/**
 * Check if credential files exist for an account
 */
export function credentialFilesExist(accountId: string): boolean {
  const credentialDir = getCredentialDir(accountId);
  const oauthKeysPath = path.join(credentialDir, 'gcp-oauth.keys.json');
  const credentialsPath = path.join(credentialDir, 'credentials.json');

  return fs.existsSync(oauthKeysPath) && fs.existsSync(credentialsPath);
}
