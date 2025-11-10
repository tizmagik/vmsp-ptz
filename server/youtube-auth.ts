import { google, Auth } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Credentials } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, '..', 'youtube-token.json');

type YouTubeTokens = Credentials;

/**
 * Create OAuth2 client
 */
export function createOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
}

/**
 * Load saved tokens from filesystem
 */
export async function loadTokens(): Promise<YouTubeTokens | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(content) as YouTubeTokens;
  } catch (error) {
    return null;
  }
}

/**
 * Save tokens to filesystem
 */
export async function saveTokens(tokens: YouTubeTokens): Promise<void> {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

/**
 * Get authenticated YouTube client
 * Returns null if not authenticated yet
 */
export async function getAuthenticatedClient(): Promise<Auth.OAuth2Client | null> {
  const oauth2Client = createOAuth2Client();
  const tokens = await loadTokens();
  
  if (!tokens) {
    return null;
  }
  
  oauth2Client.setCredentials(tokens);
  
  // Set up automatic token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('YouTube tokens refreshed');
    if (newTokens.refresh_token) {
      tokens.refresh_token = newTokens.refresh_token;
    }
    if (newTokens.access_token) {
      tokens.access_token = newTokens.access_token;
    }
    if (newTokens.expiry_date) {
      tokens.expiry_date = newTokens.expiry_date;
    }
    await saveTokens(tokens);
  });
  
  return oauth2Client;
}

/**
 * Get authorization URL for initial OAuth flow
 */
export function getAuthUrl(oauth2Client: Auth.OAuth2Client): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    prompt: 'consent', // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  oauth2Client: Auth.OAuth2Client,
  code: string
): Promise<YouTubeTokens> {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await saveTokens(tokens);
  return tokens;
}

/**
 * Check if we have valid tokens
 */
export async function isAuthenticated(): Promise<boolean> {
  const tokens = await loadTokens();
  return tokens !== null && tokens.access_token !== undefined;
}
