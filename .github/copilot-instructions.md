# vmsp-ptz: PTZ Camera Control System

## Architecture Overview

This is a **React Router v7 + Express hybrid app** for controlling PTZ cameras via a web interface. The app features:

- **Server**: Custom Express server (`server/index.ts`) that manages MediaMTX (streaming), YouTube API integration, audio playback, and real-time page synchronization
- **Client**: React Router SSR app with Vite dev server for local development
- **Streaming**: MediaMTX provides WebRTC/HLS streams from RTSP camera sources (configured in `mediamtx.yml`)
- **External Integration**: Embeds Bitfocus Companion via iframe for physical hardware control

### Key Components

**Video Pipeline**: RTSP cameras → MediaMTX (`mediamtx.exe`) → WebRTC/HLS → React client (`VideoPlayer.tsx`)
- MediaMTX spawned as child process, streams on ports 8889 (WebRTC) and 8888 (HLS)
- Fallback logic: auto-mode tries WebRTC first, falls back to HLS on error
- Camera paths defined in `app/constants/cameras.ts` and `mediamtx.yml` paths must match

**API Structure** (`server/routes.ts`): Modular routers mounted under `/api`:
- `/api/restart-mediamtx` - Restart streaming server
- `/api/audio/*` - Play/stop audio files from `public/audio/`
- `/api/yt/*` - YouTube broadcast management (OAuth, update title/thumbnail)
- `/api/page/*` - Camera page selection with Server-Sent Events for real-time sync

**Page Sync System** (`server/page.ts`): 
- POST `/api/page` updates current camera
- GET `/api/page/events` provides SSE stream for real-time updates across clients
- Client reconnects automatically on connection loss (see `_index.tsx` SSE logic)

## Development Workflow

```powershell
# Development (with MediaMTX)
npm run dev

# Development (skip MediaMTX - useful if mediamtx.exe missing)
npm run dev:no-mediamtx

# Production build
npm run build
npm start

# Type checking
npm run typecheck
```

**Dev Server Details**:
- Runs on port 8111 (configurable via `PORT` env var)
- Vite middleware mode for hot reloading
- API routes mounted BEFORE React Router to prevent SSR conflicts

**Deployment**:
- CloudFlare Tunnel exposes local Windows machine to public internet
- Public URL: `https://remote.vmspchurch.org`
- All services run on localhost, tunneled via `cloudflared` daemon
- No reverse proxy needed - CloudFlare handles SSL termination

**MediaMTX Management**:
- Binary: `mediamtx.exe` (Windows-specific, download from GitHub releases)
- Config: `mediamtx.yml` defines RTSP sources and paths
- Skip with `SKIP_MEDIAMTX=1` environment variable if not installed

## Project-Specific Conventions

### File Organization
- **`app/`**: React Router client code (routes, components, styles)
- **`server/`**: Express server modules (each feature has its own router)
- **`public/`**: Static assets (audio files, thumbnails, reader.js for legacy WebRTC)
- **Build output**: `build/client/` (static assets) and `build/server/` (SSR bundle)

### Shared Constants Pattern
Camera definitions in `app/constants/cameras.ts` are imported by BOTH client and server:
```typescript
export const CAMERAS = [
  { path: 'atem', label: 'M/V' },
  // Must match mediamtx.yml paths
];
export const VALID_CAMERA_PATHS = CAMERAS.map(c => c.path);
```

### State Management
- **No Redux/Zustand**: Uses React Router loaders + useState
- **SSE for sync**: `EventSource` subscription in `_index.tsx` keeps multiple clients in sync
- **Graceful reconnect**: SSE client auto-reconnects with 2s backoff

### Windows-Specific Features
- **Audio playback**: Uses PowerShell MediaPlayer via `spawn()` in `server/audio.ts`
- **Process management**: Global child process tracking (`global.mediamtxProcess`)
- **Graceful shutdown**: SIGINT/SIGTERM handlers stop MediaMTX and cleanup audio

## Critical Integration Points

### YouTube OAuth Flow
1. Navigate to `/api/yt/auth` → redirects to Google OAuth
2. Callback stores tokens in `youtube-token.json` (gitignored)
3. Auto-refresh via `googleapis` library (see `youtube-auth.ts`)
4. Required env vars: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`

### Companion Integration
- Embedded via iframe in `_index.tsx`: `https://ptz-companion.vmspchurch.org/emulator/...`
- Companion config stored in `vmsp.companionconfig` (8700+ lines)
- Controls physical hardware (ATEM switcher, PTZ cameras) via buttons
- Resizable split-pane interface (see `Resizer.tsx`)

### Streaming Configuration
MediaMTX paths MUST align with camera constants:
```yaml
# mediamtx.yml
paths:
  left:
    source: rtsp://192.168.100.100
  # Repeat for main, right, altar, baptism, atem
```

WebRTC requires:
- `webrtcAdditionalHosts` for production domains
- STUN server (Google's by default)
- Optional TURN servers for restricted networks

## Common Pitfalls

1. **API route ordering**: Always mount `/api` routes BEFORE `createRequestHandler()` in `server/index.ts`
2. **Module resolution**: Server uses ESM (`type: "module"`), must use `.js` extensions in imports despite TypeScript
3. **SSR hydration**: Components using browser APIs (like `EventSource`) need client-side guards
4. **MediaMTX path validation**: Invalid camera paths return 200 OK with error message (not 404)
5. **Audio file paths**: Must be relative to `public/audio/`, referenced without prefix in API calls

## Key Files Reference

- **Entry point**: `server/index.ts` - Express setup, MediaMTX lifecycle, SSR handler
- **Main route**: `app/routes/_index.tsx` - Primary UI, SSE subscription, layout logic
- **Video player**: `app/components/VideoPlayer.tsx` - WebRTC/HLS fallback logic
- **Camera config**: `app/constants/cameras.ts` + `mediamtx.yml` - Must stay synchronized
- **API modules**: `server/routes.ts` imports all feature routers
