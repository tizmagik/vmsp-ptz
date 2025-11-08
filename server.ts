// server.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// ──────────────────────────────────────────────────────────────
// Configuration (use .env or replace directly)
const PORT = 8111;
const COMPANION_PORT = 8000;
const MEDIA_MTX_CFG = 'mediamtx.yml';

// ──────────────────────────────────────────────────────────────
const app = express();
const __dirname = path.resolve();

// Serve static files (viewer.html, etc.)
app.use(express.static(__dirname));

// Proxy Companion tablet
app.use(
  '/tablet',
  createProxyMiddleware({
    target: `http://localhost:${COMPANION_PORT}`,
    changeOrigin: true,
  })
);

// Camera switch endpoint (from Companion)
app.get('/switch-camera', (req: Request, res: Response) => {
  const cam = req.query.path || 'left';
  res.redirect(`/viewer.html?camera=${encodeURIComponent(cam as string)}`);
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(` ===>  HTTP server running on http://localhost:${PORT}`);
});

// ──────────────────────────────────────────────────────────────
// Start MediaMTX
function startMediaMTX(): ChildProcess | null {
    return;
  let exePath: string;

  const localPath = path.join(__dirname, 'mediamtx.exe');
  if (fs.existsSync(localPath)) {
    exePath = localPath;
    console.log('Using local mediamtx.exe');
  } else {
    try {
      exePath = require('mediamtx-installer').path;
      console.log('Using mediamtx from npm module');
    } catch (err) {
      console.warn('⚠️  mediamtx.exe not found - video streaming disabled');
      console.warn('   Download from: https://github.com/bluenviron/mediamtx/releases');
      return null;
    }
  }

  const proc = spawn(exePath, [MEDIA_MTX_CFG], {
    stdio: 'pipe',
    cwd: __dirname,
  });

  proc.stdout.on('data', (data) => console.log(`MTX: ${data.toString().trim()}`));
  proc.stderr.on('data', (data) => console.error(`MTX ERR: ${data.toString().trim()}`));
  proc.on('close', (code) => console.log(`MediaMTX exited with code ${code}`));

  console.log('MediaMTX started (WebRTC on :8889)');
  return proc;
}

const mediamtxProcess = startMediaMTX();

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (mediamtxProcess) mediamtxProcess.kill();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => process.emit('SIGINT', 'SIGINT'));