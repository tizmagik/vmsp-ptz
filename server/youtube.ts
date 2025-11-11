import { google } from 'googleapis';
import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  createOAuth2Client,
  getAuthenticatedClient,
  getAuthUrl,
  exchangeCodeForTokens,
  isAuthenticated,
} from './youtube-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check YouTube authentication status
 */
export async function checkAuthStatus(): Promise<boolean> {
  return await isAuthenticated();
}

/**
 * Get the YouTube OAuth authorization URL
 */
export function getYouTubeAuthUrl(): string {
  const oauth2Client = createOAuth2Client();
  return getAuthUrl(oauth2Client);
}

/**
 * Exchange OAuth code for tokens
 */
export async function handleOAuthCallback(code: string): Promise<void> {
  const oauth2Client = createOAuth2Client();
  await exchangeCodeForTokens(oauth2Client, code);
}

interface UpdateBroadcastParams {
  title?: string;
  description?: string;
  thumbnail?: string;
  privacy?: 'public' | 'private' | 'unlisted';
  broadcastId?: string;
}

interface UpdateBroadcastResult {
  success: boolean;
  message?: string;
  broadcastId?: string;
  title?: string;
  description?: string;
}

/**
 * Update a YouTube broadcast (title, description, thumbnail, privacy)
 */
export async function updateBroadcast(params: UpdateBroadcastParams): Promise<UpdateBroadcastResult> {
  const { title, description, thumbnail, privacy, broadcastId } = params;
  
  // Get authenticated client
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return { 
      success: false, 
      message: 'Not authenticated. Please authenticate first at /api/yt/auth' 
    };
  }
  
  const youtube = google.youtube({ version: 'v3', auth });
  
  // If no broadcastId provided, get the active live broadcast
  let targetBroadcastId = broadcastId;
  
  if (!targetBroadcastId) {
    const broadcastsResponse = await youtube.liveBroadcasts.list({
      part: ['id', 'snippet', 'status'],
      broadcastStatus: 'active',
      maxResults: 1,
    });
    
    if (!broadcastsResponse.data.items || broadcastsResponse.data.items.length === 0) {
      // Try upcoming broadcasts if no active ones
      const upcomingResponse = await youtube.liveBroadcasts.list({
        part: ['id', 'snippet', 'status'],
        broadcastStatus: 'upcoming',
        maxResults: 1,
      });
      
      if (!upcomingResponse.data.items || upcomingResponse.data.items.length === 0) {
        return { 
          success: false, 
          message: 'No active or upcoming broadcast found' 
        };
      }
      
      targetBroadcastId = upcomingResponse.data.items[0].id || undefined;
    } else {
      targetBroadcastId = broadcastsResponse.data.items[0].id || undefined;
    }
  }
  
  if (!targetBroadcastId) {
    return { 
      success: false, 
      message: 'Could not find broadcast ID' 
    };
  }
  
  // Get current broadcast details
  const currentBroadcast = await youtube.liveBroadcasts.list({
    part: ['snippet', 'status'],
    id: [targetBroadcastId],
  });
  
  if (!currentBroadcast.data.items || currentBroadcast.data.items.length === 0) {
    return { 
      success: false, 
      message: 'Broadcast not found' 
    };
  }
  
  const snippet = currentBroadcast.data.items[0].snippet;
  const status = currentBroadcast.data.items[0].status;
  
  // Build update parts array based on what's being updated
  const partsToUpdate: string[] = [];
  const updateBody: any = {
    id: targetBroadcastId,
  };
  
  // Update snippet if title or description provided
  if (title !== undefined || description !== undefined) {
    partsToUpdate.push('snippet');
    const updatedSnippet = { ...snippet };
    
    if (title !== undefined) {
      updatedSnippet.title = title;
    }
    
    if (description !== undefined) {
      updatedSnippet.description = description;
    }
    
    updateBody.snippet = updatedSnippet;
  }
  
  // Update status if privacy provided
  if (privacy !== undefined) {
    partsToUpdate.push('status');
    const updatedStatus = { 
      ...status,
      privacyStatus: privacy,
    };
    updateBody.status = updatedStatus;
  }
  
  // Only update if there are changes to make
  if (partsToUpdate.length > 0) {
    await youtube.liveBroadcasts.update({
      part: partsToUpdate,
      requestBody: updateBody,
    });
  }
  
  // Handle thumbnail if provided
  if (thumbnail) {
    try {
      // Validate thumbnail file exists in public/thumbnails
      const thumbnailsDir = path.join(__dirname, '..', 'public', 'thumbnails');
      const thumbnailPath = path.join(thumbnailsDir, thumbnail);
      
      // Check if file exists and is within the thumbnails directory (security check)
      const normalizedPath = path.normalize(thumbnailPath);
      const normalizedDir = path.normalize(thumbnailsDir);
      
      if (!normalizedPath.startsWith(normalizedDir)) {
        console.error('Thumbnail path traversal attempt blocked:', thumbnail);
        return {
          success: false,
          message: 'Invalid thumbnail path',
        };
      }
      
      if (!fs.existsSync(thumbnailPath)) {
        console.error('Thumbnail file not found:', thumbnailPath);
        return {
          success: false,
          message: `Thumbnail file '${thumbnail}' not found`,
        };
      }
      
      // Upload thumbnail to YouTube
      await youtube.thumbnails.set({
        videoId: targetBroadcastId,
        media: {
          mimeType: thumbnail.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body: fs.createReadStream(thumbnailPath),
        },
      });
      
      console.log('Thumbnail uploaded successfully:', thumbnail);
    } catch (error: any) {
      console.error('Failed to upload thumbnail:', error);
      return {
        success: false,
        message: `Failed to upload thumbnail: ${error.message}`,
      };
    }
  }
  
  return { 
    success: true, 
    message: 'Broadcast updated successfully',
    broadcastId: targetBroadcastId,
    title: updateBody.snippet?.title || snippet?.title || undefined,
    description: updateBody.snippet?.description || snippet?.description || undefined,
  };
}

/**
 * Get list of active live broadcasts
 */
export async function listBroadcasts(): Promise<any> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return { 
      success: false, 
      message: 'Not authenticated' 
    };
  }
  
  const youtube = google.youtube({ version: 'v3', auth });
  
  const response = await youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status'],
    broadcastStatus: 'active',
    maxResults: 10,
  });
  
  return { 
    success: true, 
    broadcasts: response.data.items || [] 
  };
}

/**
 * Create router with YouTube routes
 */
export function createYouTubeRouter(): Router {
  const router = Router();

  router.get('/yt/status', async (req: Request, res: Response) => {
    try {
      const authenticated = await checkAuthStatus();
      res.json({ authenticated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.get('/yt/auth', (req: Request, res: Response) => {
    try {
      const authUrl = getYouTubeAuthUrl();
      res.redirect(authUrl);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.get('/yt/callback', async (req: Request, res: Response) => {
    const { code, error } = req.query;
    
    if (error) {
      return res.status(400).send(`Authentication failed: ${error}`);
    }
    
    if (!code || typeof code !== 'string') {
      return res.status(400).send('No authorization code received');
    }
    
    try {
      await handleOAuthCallback(code);
      res.send(`
        <html>
          <body>
            <h1>✓ YouTube Authentication Successful!</h1>
            <p>You can close this window and return to the application.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  router.post('/yt/update', async (req: Request, res: Response) => {
    try {
      const { title, description, thumbnail, privacy, broadcastId } = req.body;
      const result = await updateBroadcast({ title, description, thumbnail, privacy, broadcastId });
      
      if (!result.success) {
        const statusCode = result.message?.includes('authenticated') ? 401 : 
                           result.message?.includes('not found') ? 404 : 400;
        return res.status(statusCode).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('YouTube update error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to update broadcast' 
      });
    }
  });

  router.get('/yt/broadcasts', async (req: Request, res: Response) => {
    try {
      const result = await listBroadcasts();
      
      if (!result.success) {
        return res.status(401).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('YouTube broadcasts error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  return router;
}
