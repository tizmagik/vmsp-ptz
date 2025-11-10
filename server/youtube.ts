import { google } from 'googleapis';
import {
  createOAuth2Client,
  getAuthenticatedClient,
  getAuthUrl,
  exchangeCodeForTokens,
  isAuthenticated,
} from './youtube-auth.js';

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
  title: string;
  description?: string;
  thumbnail?: string;
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
 * Update a YouTube broadcast (title, description, thumbnail)
 */
export async function updateBroadcast(params: UpdateBroadcastParams): Promise<UpdateBroadcastResult> {
  const { title, description, thumbnail, broadcastId } = params;
  
  // Validation
  if (!title) {
    return { 
      success: false, 
      message: 'Title is required' 
    };
  }
  
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
    part: ['snippet'],
    id: [targetBroadcastId],
  });
  
  if (!currentBroadcast.data.items || currentBroadcast.data.items.length === 0) {
    return { 
      success: false, 
      message: 'Broadcast not found' 
    };
  }
  
  const snippet = currentBroadcast.data.items[0].snippet;
  
  // Update snippet with new values
  const updatedSnippet = {
    ...snippet,
    title: title,
  };
  
  if (description !== undefined) {
    updatedSnippet.description = description;
  }
  
  // Update the broadcast
  await youtube.liveBroadcasts.update({
    part: ['snippet'],
    requestBody: {
      id: targetBroadcastId,
      snippet: updatedSnippet,
    },
  });
  
  // Handle thumbnail if provided
  if (thumbnail) {
    // Thumbnail should be a base64 string or URL
    // For now, we'll note that this requires additional handling
    console.log('Thumbnail update requested but not yet implemented');
    // TODO: Implement thumbnail upload via youtube.thumbnails.set()
  }
  
  return { 
    success: true, 
    message: 'Broadcast updated successfully',
    broadcastId: targetBroadcastId,
    title: updatedSnippet.title || undefined,
    description: updatedSnippet.description || undefined,
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
