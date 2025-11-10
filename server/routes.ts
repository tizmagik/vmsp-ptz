import express, { Router } from 'express';
import type { Request, Response } from 'express';
import { restartMediaMTX } from './mediamtx.js';
import { playAudio, stopAudio, getAudioStatus } from './audio.js';
import {
  checkAuthStatus,
  getYouTubeAuthUrl,
  handleOAuthCallback,
  updateBroadcast,
  listBroadcasts,
} from './youtube.js';

const router = Router();

// ──────────────────────────────────────────────────────────────
// MediaMTX Routes
// ──────────────────────────────────────────────────────────────

router.post('/restart-mediamtx', async (req: Request, res: Response) => {
  console.log('Restart MediaMTX requested');
  const result = await restartMediaMTX();
  res.json(result);
});

// ──────────────────────────────────────────────────────────────
// Audio Routes
// ──────────────────────────────────────────────────────────────

router.post('/play-audio', (req: Request, res: Response) => {
  const { filename } = req.body;
  const result = playAudio(filename);
  
  if (!result.success) {
    const statusCode = result.message === 'Audio file not found' ? 404 : 400;
    return res.status(statusCode).json(result);
  }
  
  res.json(result);
});

router.post('/stop-audio', (req: Request, res: Response) => {
  const result = stopAudio();
  res.json(result);
});

router.get('/audio-status', (req: Request, res: Response) => {
  res.send(getAudioStatus());
});

// ──────────────────────────────────────────────────────────────
// YouTube Routes
// ──────────────────────────────────────────────────────────────

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
    const { title, description, thumbnail, broadcastId } = req.body;
    const result = await updateBroadcast({ title, description, thumbnail, broadcastId });
    
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

export default router;
