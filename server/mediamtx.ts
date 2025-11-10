import { spawn, ChildProcess } from 'child_process';
import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import { MEDIAMTX_PATH, MEDIAMTX_CONFIG_PATH, ROOT_DIR } from './config.js';

// Global process tracker
declare global {
  var mediamtxProcess: ChildProcess | null;
}

/**
 * Start the MediaMTX streaming server
 */
export function startMediaMTX(): ChildProcess | null {
  if (!fs.existsSync(MEDIAMTX_PATH)) {
    console.warn('⚠️  mediamtx.exe not found - video streaming disabled');
    console.warn('   Download from: https://github.com/bluenviron/mediamtx/releases');
    return null;
  }

  const proc = spawn(MEDIAMTX_PATH, [MEDIAMTX_CONFIG_PATH], {
    stdio: 'pipe',
    cwd: ROOT_DIR,
  });

  proc.stdout?.on('data', (data) => console.log(`MTX: ${data.toString().trim()}`));
  proc.stderr?.on('data', (data) => console.error(`MTX ERR: ${data.toString().trim()}`));
  proc.on('close', (code) => console.log(`MediaMTX exited with code ${code}`));

  console.log('MediaMTX started (WebRTC on :8889)');
  return proc;
}

/**
 * Restart the MediaMTX streaming server
 */
export function restartMediaMTX(): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    if (global.mediamtxProcess) {
      console.log('Killing existing MediaMTX process...');
      global.mediamtxProcess.kill();
      
      // Wait a moment then restart
      setTimeout(() => {
        global.mediamtxProcess = startMediaMTX();
        resolve({ success: true, message: 'MediaMTX restarted' });
      }, 1000);
    } else {
      // Start it if it wasn't running
      global.mediamtxProcess = startMediaMTX();
      resolve({ success: true, message: 'MediaMTX started' });
    }
  });
}

/**
 * Stop the MediaMTX streaming server
 */
export function stopMediaMTX(): void {
  if (global.mediamtxProcess) {
    console.log('Stopping MediaMTX...');
    global.mediamtxProcess.kill();
    global.mediamtxProcess = null;
  }
}

/**
 * Create router with MediaMTX routes
 */
export function createMediaMTXRouter(): Router {
  const router = Router();

  router.post('/restart-mediamtx', async (req: Request, res: Response) => {
    console.log('Restart MediaMTX requested');
    const result = await restartMediaMTX();
    res.json(result);
  });

  return router;
}
