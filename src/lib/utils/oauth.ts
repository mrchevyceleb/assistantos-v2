import { updateSetting } from '$lib/stores/settings';

let codeVerifier = '';

function randomVerifier(length = 64): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function sha256Base64Url(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = Array.from(new Uint8Array(digest));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startOpenRouterOAuth(): Promise<string> {
  const verifier = randomVerifier(64);
  codeVerifier = verifier;
  const challenge = await sha256Base64Url(verifier);
  const callbackUrl = 'http://localhost:3000/openrouter-oauth-callback';
  const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(authUrl);
  return 'Browser opened. After login, paste the returned code below.';
}

export async function exchangeOpenRouterOAuthCode(code: string): Promise<string> {
  if (!code.trim()) throw new Error('No code provided');
  if (!codeVerifier) throw new Error('Start OAuth first so a code verifier is generated.');

  const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code.trim(),
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);

  const parsed = JSON.parse(text);
  const key = parsed?.key;
  if (!key || typeof key !== 'string') {
    throw new Error('OAuth exchange succeeded but no key was returned.');
  }

  updateSetting('aiProvider', 'openrouter');
  updateSetting('aiAuthMode', 'oauth');
  updateSetting('aiOpenRouterApiKey', key);
  updateSetting('aiApiKey', key);
  return 'Connected. OpenRouter OAuth key saved.';
}
