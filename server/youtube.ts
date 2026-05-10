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
import { THUMBNAILS_DIR } from './config.js';

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
      // Validate thumbnail file exists
      const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnail);
      
      // Check if file exists and is within the thumbnails directory (security check)
      const normalizedPath = path.normalize(thumbnailPath);
      const normalizedDir = path.normalize(THUMBNAILS_DIR);
      
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
    // broadcastStatus: 'active',
    mine: true,
    maxResults: 10,
  });
  
  return { 
    success: true, 
    broadcasts: response.data.items || [] 
  };
}

/**
 * Get list of available thumbnails
 */
export function listThumbnails(): string[] {
  try {
    if (!fs.existsSync(THUMBNAILS_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(THUMBNAILS_DIR);
    // Filter for image files only
    return files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file)).sort();
  } catch (error) {
    console.error('Error reading thumbnails directory:', error);
    return [];
  }
}

interface PrepareBroadcastParams {
  title?: string;
  description?: string;
  privacy?: 'public' | 'private' | 'unlisted';
  scheduledStartTime?: string;
}

interface PrepareBroadcastResult {
  success: boolean;
  message?: string;
  broadcastId?: string;
  streamId?: string;
  streamKey?: string;
  rtmpUrl?: string;
  title?: string;
}

/**
 * Prepare a new broadcast ready to receive stream from ATEM.
 * Uses a reusable stream so the RTMP key stays the same.
 * Sets enableAutoStart so broadcast goes live automatically when stream starts.
 */
export async function prepareBroadcast(params: PrepareBroadcastParams = {}): Promise<PrepareBroadcastResult> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return { 
      success: false, 
      message: 'Not authenticated. Please authenticate first at /api/yt/auth' 
    };
  }
  
  const youtube = google.youtube({ version: 'v3', auth });
  
  // Check if there's already a broadcast in 'ready' or 'live' state
  const activeResponse = await youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    broadcastStatus: 'active',
    maxResults: 1,
  });
  
  if (activeResponse.data.items && activeResponse.data.items.length > 0) {
    const activeBroadcast = activeResponse.data.items[0];
    const status = activeBroadcast.status?.lifeCycleStatus;
    return {
      success: true,
      message: `Broadcast already ${status}: "${activeBroadcast.snippet?.title}"`,
      broadcastId: activeBroadcast.id || undefined,
      title: activeBroadcast.snippet?.title || undefined,
    };
  }
  
  // Check for upcoming broadcasts that are ready
  const upcomingResponse = await youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    broadcastStatus: 'upcoming',
    maxResults: 5,
  });

  console.log('Upcoming broadcasts found:', upcomingResponse.data.items);
  
  const readyBroadcast = upcomingResponse.data.items?.find(
    b => b.status?.lifeCycleStatus === 'ready'
  );
  
  if (readyBroadcast) {
    return {
      success: true,
      message: `Broadcast already ready: "${readyBroadcast.snippet?.title}"`,
      broadcastId: readyBroadcast.id || undefined,
      title: readyBroadcast.snippet?.title || undefined,
      readyBroadcast,
    };
  }
  
  // Default title with current date/time
  const now = new Date();
  const defaultTitle = `VMSP Church Live Stream - ${now.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })}`;
  
  const title = params.title || defaultTitle;
  const description = params.description || '#vmsp #vmspchurch #coptic';
  const privacy = params.privacy || 'public';
  
  // Schedule for now (or slightly in the future)
  const scheduledStartTime = params.scheduledStartTime || new Date(Date.now() + 60000).toISOString();
  
  try {
    // Step 1: Find an existing reusable stream or create one
    let streamId: string | undefined;
    let streamKey: string | undefined;
    let rtmpUrl: string | undefined;
    
    const streamsResponse = await youtube.liveStreams.list({
      part: ['id', 'snippet', 'cdn', 'contentDetails', 'status'],
      mine: true,
      maxResults: 50,
    });
    
    // Look for a reusable stream
    const reusableStream = streamsResponse.data.items?.find(
      stream => stream.contentDetails?.isReusable === true
    );
    
    if (reusableStream) {
      streamId = reusableStream.id || undefined;
      streamKey = reusableStream.cdn?.ingestionInfo?.streamName;
      rtmpUrl = reusableStream.cdn?.ingestionInfo?.ingestionAddress;
      console.log('Found existing reusable stream:', streamId);
    } else {
      // Create a new reusable stream
      console.log('Creating new reusable stream...');
      const newStream = await youtube.liveStreams.insert({
        part: ['snippet', 'cdn', 'contentDetails', 'status'],
        requestBody: {
          snippet: {
            title: 'VMSP Church Live Stream',
            description: '#vmsp #vmspchurch #coptic',
          },
          cdn: {
            frameRate: 'variable',
            ingestionType: 'rtmp',
            resolution: 'variable',
          },
          contentDetails: {
            isReusable: true,
          },
        },
      });
      
      streamId = newStream.data.id || undefined;
      streamKey = newStream.data.cdn?.ingestionInfo?.streamName;
      rtmpUrl = newStream.data.cdn?.ingestionInfo?.ingestionAddress;
      console.log('Created new reusable stream:', streamId);
    }
    
    if (!streamId) {
      return {
        success: false,
        message: 'Failed to get or create stream',
      };
    }
    
    // Step 2: Create a new broadcast with autoStart enabled
    console.log('Creating broadcast:', title);
    const broadcastResponse = await youtube.liveBroadcasts.insert({
      part: ['snippet', 'contentDetails', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          scheduledStartTime,
        },
        contentDetails: {
          enableAutoStart: true,  // Auto-start when stream begins
          enableAutoStop: true,   // Auto-stop when stream ends
          enableDvr: true,
          enableEmbed: true,
          recordFromStart: true,
          monitorStream: {
            enableMonitorStream: false,  // Skip testing phase
          },
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false,
        },
      },
    });
    
    const broadcastId = broadcastResponse.data.id;
    
    if (!broadcastId) {
      return {
        success: false,
        message: 'Failed to create broadcast',
      };
    }
    
    console.log('Created broadcast:', broadcastId);
    
    // Step 3: Bind the stream to the broadcast
    console.log('Binding stream to broadcast...');
    await youtube.liveBroadcasts.bind({
      id: broadcastId,
      part: ['id', 'snippet', 'contentDetails', 'status'],
      streamId: streamId,
    });
    
    console.log('Broadcast prepared successfully!');
    
    return {
      success: true,
      message: `Broadcast "${title}" is ready. Start streaming from ATEM and it will go live automatically.`,
      broadcastId,
      streamId,
      streamKey,
      rtmpUrl: rtmpUrl ? `${rtmpUrl}/${streamKey}` : undefined,
      title,
    };
    
  } catch (error: any) {
    console.error('Failed to prepare broadcast:', error);
    return {
      success: false,
      message: `Failed to prepare broadcast: ${error.message}`,
    };
  }
}

/**
 * Check if a broadcast is ready for streaming. The "ready" state happens automatically
 * when the broadcast is bound to a stream and the stream is receiving video.
 * This endpoint returns the current status and what's needed to get to ready state.
 */
export async function completeBroadcast(broadcastId?: string): Promise<UpdateBroadcastResult> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return { 
      success: false, 
      message: 'Not authenticated. Please authenticate first at /api/yt/auth' 
    };
  }
  
  const youtube = google.youtube({ version: 'v3', auth });
  
  // If no broadcastId provided, find an upcoming broadcast
  let targetBroadcastId = broadcastId;
  let snippet: any;
  let status: any;
  let contentDetails: any;
  
  if (!targetBroadcastId) {
    // Try upcoming broadcasts first (these can become ready)
    const upcomingResponse = await youtube.liveBroadcasts.list({
      part: ['id', 'snippet', 'status', 'contentDetails'],
      broadcastStatus: 'upcoming',
      maxResults: 1,
    });
    
    if (upcomingResponse.data.items && upcomingResponse.data.items.length > 0) {
      targetBroadcastId = upcomingResponse.data.items[0].id || undefined;
      snippet = upcomingResponse.data.items[0].snippet;
      status = upcomingResponse.data.items[0].status;
      contentDetails = upcomingResponse.data.items[0].contentDetails;
    } else {
      // Check active broadcasts
      const activeResponse = await youtube.liveBroadcasts.list({
        part: ['id', 'snippet', 'status', 'contentDetails'],
        broadcastStatus: 'active',
        maxResults: 1,
      });
      
      if (activeResponse.data.items && activeResponse.data.items.length > 0) {
        targetBroadcastId = activeResponse.data.items[0].id || undefined;
        snippet = activeResponse.data.items[0].snippet;
        status = activeResponse.data.items[0].status;
        contentDetails = activeResponse.data.items[0].contentDetails;
      }
    }
    
    if (!targetBroadcastId) {
      return { 
        success: false, 
        message: 'No upcoming or active broadcast found. Create a new scheduled broadcast first.' 
      };
    }
  } else {
    // Get broadcast details for the provided ID
    const currentBroadcast = await youtube.liveBroadcasts.list({
      part: ['snippet', 'status', 'contentDetails'],
      id: [targetBroadcastId],
    });
    
    if (!currentBroadcast.data.items || currentBroadcast.data.items.length === 0) {
      return { 
        success: false, 
        message: 'Broadcast not found' 
      };
    }
    
    snippet = currentBroadcast.data.items[0].snippet;
    status = currentBroadcast.data.items[0].status;
    contentDetails = currentBroadcast.data.items[0].contentDetails;
  }
  
  const lifeCycleStatus = status?.lifeCycleStatus;
  const boundStreamId = contentDetails?.boundStreamId;
  
  // Check if already in ready state
  if (lifeCycleStatus === 'ready') {
    return {
      success: true,
      message: 'Broadcast is already in ready state. You can start streaming!',
      broadcastId: targetBroadcastId,
      title: snippet?.title || undefined,
    };
  }
  
  // Check if already complete
  if (lifeCycleStatus === 'complete') {
    return {
      success: false,
      message: 'Broadcast is already complete. Create a new scheduled broadcast.',
    };
  }
  
  // Check if already live
  if (lifeCycleStatus === 'live' || lifeCycleStatus === 'liveStarting') {
    return {
      success: true,
      message: `Broadcast is already ${lifeCycleStatus}.`,
      broadcastId: targetBroadcastId,
      title: snippet?.title || undefined,
    };
  }
  
  // If no stream bound, that's the problem
  if (!boundStreamId) {
    return {
      success: false,
      message: 'Broadcast has no stream bound. Bind a stream to this broadcast first.',
      broadcastId: targetBroadcastId,
    };
  }
  
  // Check the stream status
  const streamResponse = await youtube.liveStreams.list({
    part: ['status', 'snippet'],
    id: [boundStreamId],
  });
  
  if (!streamResponse.data.items || streamResponse.data.items.length === 0) {
    return {
      success: false,
      message: 'Bound stream not found.',
      broadcastId: targetBroadcastId,
    };
  }
  
  const streamStatus = streamResponse.data.items[0].status?.streamStatus;
  const streamHealth = streamResponse.data.items[0].status?.healthStatus?.status;
  
  // The broadcast will automatically transition to "ready" when stream is active
  if (streamStatus === 'active') {
    // Stream is active, broadcast should be or become ready
    return {
      success: true,
      message: `Stream is active (health: ${streamHealth}). Broadcast status: ${lifeCycleStatus}. If status is "created", it should transition to "ready" shortly.`,
      broadcastId: targetBroadcastId,
      title: snippet?.title || undefined,
    };
  }
  
  return {
    success: false,
    message: `Stream status is "${streamStatus}" (needs to be "active"). Start sending video from ATEM to the RTMP endpoint. Broadcast will automatically become "ready" when YouTube receives video.`,
    broadcastId: targetBroadcastId,
    title: snippet?.title || undefined,
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

  router.get('/yt/thumbnails', (req: Request, res: Response) => {
    try {
      const thumbnails = listThumbnails();
      res.json({ success: true, thumbnails });
    } catch (error: any) {
      console.error('Thumbnails list error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  router.post('/yt/complete', async (req: Request, res: Response) => {
    try {
      const { broadcastId } = req.body;
      const result = await completeBroadcast(broadcastId);
      
      if (!result.success) {
        const statusCode = result.message?.includes('authenticated') ? 401 : 
                           result.message?.includes('not found') ? 404 : 400;
        return res.status(statusCode).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('YouTube complete broadcast error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to complete broadcast' 
      });
    }
  });

  router.post('/yt/prepare', async (req: Request, res: Response) => {
    try {
      const { title, description, privacy, scheduledStartTime } = req.body;
      const result = await prepareBroadcast({ title, description, privacy, scheduledStartTime });
      
      if (!result.success) {
        const statusCode = result.message?.includes('authenticated') ? 401 : 400;
        return res.status(statusCode).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('YouTube prepare broadcast error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to prepare broadcast' 
      });
    }
  });

  return router;
}
