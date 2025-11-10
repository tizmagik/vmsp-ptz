import 'dotenv/config';
import { createRequestHandler } from '@react-router/express';
import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import {
  createOAuth2Client,
  getAuthenticatedClient,
  getAuthUrl,
  exchangeCodeForTokens,
  isAuthenticated,
} from './youtube-auth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 8111;
const MEDIA_MTX_CFG = 'mediamtx.yml';

// Global audio process tracker
let audioProcess = null;
let isAudioPlaying = false;
let currentAudioFile = '';

// ──────────────────────────────────────────────────────────────
// Start MediaMTX function
function startMediaMTX() {
  const exePath = path.join(__dirname, 'mediamtx.exe');
  
  if (!fs.existsSync(exePath)) {
    console.warn('⚠️  mediamtx.exe not found - video streaming disabled');
    console.warn('   Download from: https://github.com/bluenviron/mediamtx/releases');
    return null;
  }

  const configPath = path.join(__dirname, MEDIA_MTX_CFG);
  const proc = spawn(exePath, [configPath], {
    stdio: 'pipe',
    cwd: __dirname,
  });

  proc.stdout.on('data', (data) => console.log(`MTX: ${data.toString().trim()}`));
  proc.stderr.on('data', (data) => console.error(`MTX ERR: ${data.toString().trim()}`));
  proc.on('close', (code) => console.log(`MediaMTX exited with code ${code}`));

  console.log('MediaMTX started (WebRTC on :8889)');
  return proc;
}

// Create Express app
const app = express();

// Disable caching in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
}

// Add JSON body parser for API routes
app.use(express.json());

// API endpoint to restart MediaMTX - MUST come before Vite/React Router middleware
app.post('/api/restart-mediamtx', (req, res) => {
  console.log('Restart MediaMTX requested');
  
  if (global.mediamtxProcess) {
    console.log('Killing existing MediaMTX process...');
    global.mediamtxProcess.kill();
    
    // Wait a moment then restart
    setTimeout(() => {
      global.mediamtxProcess = startMediaMTX();
      res.json({ success: true, message: 'MediaMTX restarted' });
    }, 1000);
  } else {
    // Start it if it wasn't running
    global.mediamtxProcess = startMediaMTX();
    res.json({ success: true, message: 'MediaMTX started' });
  }
});

// API endpoint to play audio on host machine
app.post('/api/play-audio', (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Filename required' });
  }
  
  const audioPath = path.join(__dirname, 'public', 'audio', filename);
  
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ success: false, message: 'Audio file not found' });
  }
  
  // Stop any existing audio
  if (audioProcess) {
    audioProcess.kill();
    audioProcess = null;
  }
  
  console.log(`Playing audio: ${filename}`);
  isAudioPlaying = true;
  currentAudioFile = filename;
  
  // Use PowerShell with SoundPlayer for better audio playback
  const escapedPath = audioPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const powershellCommand = `
    Add-Type -AssemblyName presentationCore;
    $player = New-Object System.Windows.Media.MediaPlayer;
    $player.Open('${escapedPath}');
    $player.Play();
    while ($player.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 100 }
    $duration = $player.NaturalDuration.TimeSpan.TotalSeconds;
    Start-Sleep -Seconds $duration;
  `.trim();
  
  audioProcess = spawn('powershell.exe', ['-Command', powershellCommand], {
    stdio: 'pipe',
    cwd: __dirname,
  });
  
  audioProcess.on('close', (code) => {
    console.log(`Audio playback finished: ${filename}`);
    audioProcess = null;
    isAudioPlaying = false;
    currentAudioFile = '';
  });
  
  res.json({ success: true, message: `Playing ${filename}` });
});

// API endpoint to stop audio playback
app.post('/api/stop-audio', (req, res) => {
  if (audioProcess) {
    console.log('Stopping audio playback');
    audioProcess.kill();
    audioProcess = null;
    isAudioPlaying = false;
    currentAudioFile = '';
    res.json({ success: true, message: 'Audio stopped' });
  } else {
    res.json({ success: false, message: 'No audio playing' });
  }
});

// API endpoint to check audio status
app.get('/api/audio-status', (req, res) => {
  res.send(currentAudioFile.replace('.mp3', ''));
});

// ──────────────────────────────────────────────────────────────
// YouTube API Endpoints
// ──────────────────────────────────────────────────────────────

// Check YouTube authentication status
app.get('/api/yt/status', async (req, res) => {
  try {
    const authenticated = await isAuthenticated();
    res.json({ authenticated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initiate YouTube OAuth flow
app.get('/api/yt/auth', (req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    const authUrl = getAuthUrl(oauth2Client);
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// OAuth callback endpoint
app.get('/api/yt/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.status(400).send(`Authentication failed: ${error}`);
  }
  
  if (!code) {
    return res.status(400).send('No authorization code received');
  }
  
  try {
    const oauth2Client = createOAuth2Client();
    await exchangeCodeForTokens(oauth2Client, code);
    res.send(`
      <html>
        <body>
          <h1>✓ YouTube Authentication Successful!</h1>
          <p>You can close this window and return to the application.</p>
          <script>window.close();</script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Update YouTube broadcast (title, description, thumbnail)
app.post('/api/yt/update', async (req, res) => {
  try {
    const { title, description, thumbnail, broadcastId } = req.body;
    
    // Validation
    if (!title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title is required' 
      });
    }
    
    // Get authenticated client
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated. Please authenticate first at /api/yt/auth' 
      });
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
          return res.status(404).json({ 
            success: false, 
            message: 'No active or upcoming broadcast found' 
          });
        }
        
        targetBroadcastId = upcomingResponse.data.items[0].id;
      } else {
        targetBroadcastId = broadcastsResponse.data.items[0].id;
      }
    }
    
    // Get current broadcast details
    const currentBroadcast = await youtube.liveBroadcasts.list({
      part: ['snippet'],
      id: [targetBroadcastId],
    });
    
    if (!currentBroadcast.data.items || currentBroadcast.data.items.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Broadcast not found' 
      });
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
    const updateResponse = await youtube.liveBroadcasts.update({
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
    
    res.json({ 
      success: true, 
      message: 'Broadcast updated successfully',
      broadcastId: targetBroadcastId,
      title: updatedSnippet.title,
      description: updatedSnippet.description,
    });
    
  } catch (error) {
    console.error('YouTube update error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update broadcast' 
    });
  }
});

// Get list of live broadcasts
app.get('/api/yt/broadcasts', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated' 
      });
    }
    
    const youtube = google.youtube({ version: 'v3', auth });
    
    const response = await youtube.liveBroadcasts.list({
      part: ['id', 'snippet', 'status'],
      broadcastStatus: 'active',
      maxResults: 10,
    });
    
    res.json({ 
      success: true, 
      broadcasts: response.data.items || [] 
    });
    
  } catch (error) {
    console.error('YouTube broadcasts error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});


// Setup Vite dev server in development
const viteDevServer =
  process.env.NODE_ENV === 'production'
    ? null
    : await import('vite').then((vite) =>
        vite.createServer({
          server: { middlewareMode: true },
        })
      );

// Use Vite dev server middleware in development
if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  // Serve static files in production
  app.use(express.static(path.join(__dirname, 'build/client')));
}

// Load the built server in production or dev
const build = viteDevServer
  ? () => viteDevServer.ssrLoadModule('virtual:react-router/server-build')
  : await import('./build/server/index.js');

// React Router request handler
app.all('*', createRequestHandler({ build }));

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(` ===>  React Router server running on http://localhost:${PORT}`);
});

// Start MediaMTX on server startup
global.mediamtxProcess = startMediaMTX();

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (global.mediamtxProcess) {
    global.mediamtxProcess.kill();
  }
  if (viteDevServer) {
    await viteDevServer.close();
  }
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => process.emit('SIGINT', 'SIGINT'));
