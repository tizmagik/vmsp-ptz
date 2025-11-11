import 'dotenv/config';
import { createRequestHandler } from '@react-router/express';
import express from 'express';
import type { ViteDevServer } from 'vite';
import { PORT, BUILD_CLIENT_DIR } from './config.js';
import { disableCaching } from './middleware.js';
import { startMediaMTX, stopMediaMTX } from './mediamtx.js';
import { cleanupAudio } from './audio.js';
import { createAPIRouter } from './routes.js';

// Create Express app
const app = express();

// Apply middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(disableCaching);
}
app.use(express.json());

// Mount API routes - MUST come before Vite/React Router middleware
app.use('/api', createAPIRouter());

// Setup Vite dev server in development
const viteDevServer: ViteDevServer | null =
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
  app.use(express.static(BUILD_CLIENT_DIR));
}

// Load the built server in production or dev
const build: any = viteDevServer
  ? () => viteDevServer.ssrLoadModule('virtual:react-router/server-build')
  // @ts-expect-error -- Build import
  : await import('../build/server/index.js');

// React Router request handler for all other routes
app.all('*', createRequestHandler({ build }));

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(` ===>  React Router server running on http://localhost:${PORT}`);
});

// Start MediaMTX on server startup
if (!process.env.SKIP_MEDIAMTX) {
  global.mediamtxProcess = startMediaMTX();
}

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────────────────────

async function shutdown() {
  console.log('\nShutting down...');
  
  stopMediaMTX();
  cleanupAudio();
  
  if (viteDevServer) {
    await viteDevServer.close();
  }
  
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
