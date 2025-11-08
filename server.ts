// server.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Cloudflare } from 'cloudflare';
import { quickTunnel } from 'cloudflared';

// ──────────────────────────────────────────────────────────────
// Configuration (use .env or replace directly)
const PORT = 8111;
const COMPANION_PORT = 8080;
const MEDIA_MTX_CFG = 'mediamtx.yml';
const TUNNEL_NAME = 'rtsp-viewer';
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'vmsp-tunnel.trycloudflare.com'; // default to cf generic tunnel

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
    logLevel: 'silent',
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
// Programmatic Named Cloudflare Tunnel
interface TunnelStop {
  (): Promise<void>;
}

async function startNamedTunnel(): Promise<{ url: string; stop: TunnelStop }> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const tunnelToken = process.env.CF_TUNNEL_TOKEN;

  if (!accountId || !tunnelToken) {
    console.warn('⚠️  CF_ACCOUNT_ID and CF_TUNNEL_TOKEN not set - skipping tunnel setup');
    console.warn('   Server will only be accessible locally');
    return {
      url: `http://localhost:${PORT}`,
      stop: async () => {}
    };
  }

  const cf = new Cloudflare({ apiToken: tunnelToken, accountId: accountId });

  try {
    // 1. List or create tunnel
    const listRes = await cf.zeroTrust.tunnels.list({ account_id: accountId });
    let tunnel = listRes.result.find((t: any) => t.name === TUNNEL_NAME);

    if (!tunnel) {
      console.log(`Creating tunnel: ${TUNNEL_NAME}`);
      const createRes = await cf.zeroTrust.tunnels.create({
        account_id: accountId,
        name: TUNNEL_NAME,
        tunnel_type: 'cloudflared',
      });
      tunnel = createRes.result;
    } else {
      console.log(`Using existing tunnel: ${tunnel.id}`);
    }

    // 2. Ensure public hostname route
    const routesRes = await cf.zeroTrust.tunnels.routes.list({
      account_id: accountId,
      tunnel_id: tunnel.id
    });
    const hasRoute = routesRes.result.some((r: any) => r.hostname === PUBLIC_HOST);

    if (!hasRoute) {
      console.log(`Adding route: ${PUBLIC_HOST} → http://localhost:${PORT}`);
      await cf.zeroTrust.tunnels.routes.create({
        account_id: accountId,
        tunnel_id: tunnel.id,
        hostname: PUBLIC_HOST,
        service: `http://localhost:${PORT}`,
      });
    }

    // 3. Start tunnel with token
    console.log('Starting tunnel...');
    const { url, stop } = await quickTunnel({
      token: tunnelToken,
      port: PORT,
    });

    console.log(`\nTunnel Active: ${url}`);
    console.log(`Viewer: ${url}/viewer.html\n`);

    return { url, stop };
  } catch (err: any) {
    console.error('Tunnel setup failed:', err.message);
    console.warn('Server will continue running locally only');
    return {
      url: `http://localhost:${PORT}`,
      stop: async () => {}
    };
  }
}

// ──────────────────────────────────────────────────────────────
// Run tunnel
let tunnelStop: TunnelStop | null = null;
startNamedTunnel()
  .then(({ stop }) => {
    tunnelStop = stop;
  })
  .catch((err) => {
    console.error('Failed to start tunnel:', err.message);
    console.log('Server will continue running locally only');
  });

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (tunnelStop) await tunnelStop();
  if (mediamtxProcess) mediamtxProcess.kill();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => process.emit('SIGINT', 'SIGINT'));