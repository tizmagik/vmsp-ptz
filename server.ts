import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn, ChildProcess } from 'child_process';
import { Tunnel, bin, install } from 'cloudflared';
import path from 'path';
import fs from 'fs';
import { Server } from 'http';

// Config (adjust as needed)
const PORT: number = 8111;
const COMPANION_PORT: number = 8000;  // Bitfocus Companion port
const MEDIA_MTX_PATH: string = 'mediamtx.yml';  // Your config file

const app = express();
const projectDir: string = __dirname;

// === Serve Static Files ===
app.use(express.static(projectDir));  // Serves viewer.html, etc.

// === Proxy /tablet to Companion ===
app.use('/tablet', createProxyMiddleware({
  target: `http://localhost:${COMPANION_PORT}`,
  changeOrigin: true,
  pathRewrite: { '^/tablet': '/tablet' }
}));

// === Camera Switch Route ===
app.get('/switch-camera', (req: Request, res: Response) => {
  const cameraPath: string = (req.query.path as string) || 'left';
  res.redirect(`/viewer.html?camera=${cameraPath}`);
});

// === Start Server ===
const server: Server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Viewer: http://localhost:${PORT}/viewer.html`);
});

// === Spawn MediaMTX ===
function startMediaMTX(): ChildProcess {
  let mediamtxPath: string;
  
  // First, try to use local mediamtx.exe
  const localPath = path.join(__dirname, 'mediamtx.exe');
  if (fs.existsSync(localPath)) {
    mediamtxPath = localPath;
    console.log('Using local mediamtx.exe');
  } else {
    // Fallback to mediamtx-installer module
    try {
      mediamtxPath = require('mediamtx-installer').path;  // Auto-downloads if missing
      console.log('Using mediamtx from npm module');
    } catch (err) {
      console.error('Error: mediamtx.exe not found. Download from https://github.com/bluenviron/mediamtx/releases');
      process.exit(1);
    }
  }

  const mediamtx: ChildProcess = spawn(mediamtxPath, [MEDIA_MTX_PATH], {
    stdio: 'pipe',
    cwd: __dirname
  });

  mediamtx.stdout?.on('data', (data: Buffer) => console.log(`MediaMTX: ${data}`));
  mediamtx.stderr?.on('data', (data: Buffer) => console.error(`MediaMTX Error: ${data}`));
  mediamtx.on('close', (code: number | null) => console.log(`MediaMTX exited with code ${code}`));

  console.log('Started MediaMTX (WebRTC on :8889)');
  return mediamtx;
}

const mediamtxProcess: ChildProcess = startMediaMTX();

// === Start Cloudflare Tunnel ===
async function startTunnel(): Promise<void> {
  try {
    // Install cloudflared binary if not present
    if (!fs.existsSync(bin)) {
      console.log('Installing cloudflared...');
      await install(bin);
    }

    // Run: cloudflared tunnel --hello-world
    const tunnel = Tunnel.quick();

    // Wait for the URL
    tunnel.once('url', (url: string) => {
      console.log(`\n🚀 Public HTTPS Tunnel: ${url}`);
      console.log(`Viewer: ${url}/viewer.html`);
      console.log(`(Tunnel closes when this process exits)`);
    });

    tunnel.once('connected', (connection: any) => {
      console.log('Tunnel connected:', connection);
    });
    
    tunnel.on('error', (err: Error) => {
      console.error('Tunnel error:', err.message);
    });

    tunnel.on('exit', (code: number | null) => {
      console.log(`Tunnel process exited with code ${code}`);
    });

    // Store reference for cleanup
    process.on('SIGINT', () => {
      console.log('\nShutting down tunnel...');
      tunnel.stop();
    });
  } catch (err) {
    console.error('Tunnel failed:', (err as Error).message);
  }
}

startTunnel();

// === Graceful Shutdown ===
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  mediamtxProcess.kill();
  server.close(() => {
    process.exit(0);
  });
});
