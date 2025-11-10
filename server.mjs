import 'dotenv/config';
import { createRequestHandler } from '@react-router/express';
import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 8111;
const MEDIA_MTX_CFG = 'mediamtx.yml';

// Create Express app
const app = express();

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

// ──────────────────────────────────────────────────────────────
// Start MediaMTX
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

const mediamtxProcess = startMediaMTX();

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (mediamtxProcess) {
    mediamtxProcess.kill();
  }
  if (viteDevServer) {
    await viteDevServer.close();
  }
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => process.emit('SIGINT', 'SIGINT'));
