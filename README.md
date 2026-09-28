# VMSP Remote

Web control room for VMSP's livestream. It puts a live camera/ATEM preview next
to a Bitfocus Companion button panel, with controls for stream selection, audio
monitoring, MediaMTX, and YouTube broadcast metadata.

The app is a React Router 7 server-rendered UI served by Express. A MediaMTX
process on the Windows streaming PC reads the cameras and capture devices and
publishes WebRTC and HLS streams. The deployed app is at
[`remote.vmspchurch.org`](https://remote.vmspchurch.org/).

## What the operator sees

- **Preview:** Choose M/V (ATEM), Main, Left, Right, Altar, Baptism, or Basement.
  The status badge identifies the selected source and whether it is using RTC
  or HLS.
- **Stream mode:** The gear menu offers Auto, RTC, and HLS. Auto tries RTC first
  and falls back to HLS on an RTC error or if video has not started in seven
  seconds. RTC is intended for lower latency; HLS is the fallback.
- **Audio:** The speaker button plays the separate `atem-audio` HLS stream in
  the browser. Video previews are muted by default.
- **Companion:** The right panel embeds the Bitfocus Companion emulator for
  production controls, including the PTZ and switcher buttons. Drag the divider
  to resize the preview and Companion panels.
- **Maintenance:** The gear menu can refresh the page, restart MediaMTX, or
  update the current YouTube broadcast's title, description, thumbnail, and
  privacy setting. The title form can append today's date.

The camera buttons change the preview in the current browser. An external
controller can select a page for all connected browsers through
`POST /api/page`; the app receives those updates over Server-Sent Events (SSE).

## How it fits together

```text
RTSP cameras (.100-.105) ─┐
ATEM video/audio via FFmpeg ├─> MediaMTX on streaming PC (.252)
                          ┘      ├─> WebRTC/WHEP ─┐
                                 └─> HLS ─────────┴─> browser preview

Express + React Router ──> web UI and /api routes
Bitfocus Companion ─────> embedded control panel
YouTube API ─────────────> broadcast metadata and preparation
```

The camera and stream names are defined in both
[`app/constants/cameras.ts`](app/constants/cameras.ts) and
[`mediamtx.yml`](mediamtx.yml); keep them aligned when adding or renaming a
source. MediaMTX pulls `left`, `main`, `right`, `altar`, `baptism`, and
`basement` from RTSP cameras at `192.168.100.100` through `.105`. Its `atem`
and `atem-audio` paths use FFmpeg with the Windows Blackmagic capture devices.

| Service | Configured address | Purpose |
| --- | --- | --- |
| Express app | `:8111` by default | UI, SSR, and `/api` |
| MediaMTX RTSP | `:8554` by default | Camera and FFmpeg ingest |
| MediaMTX HLS | `:8888` | HLS video and audio |
| MediaMTX WebRTC signaling | `:8889` | WHEP handshake |
| MediaMTX WebRTC media | TCP/UDP `:8189` | Direct RTC media path |

The browser uses `ptz-rtc.vmspchurch.org` for WHEP,
`ptz-hls.vmspchurch.org` for HLS, and `ptz-companion.vmspchurch.org` for the
Companion iframe. Those URLs are currently set in the React components; this
repository does not contain the Cloudflare Tunnel configuration for the public
hostnames.

## Run the project

**Requirements:** Node.js 20 or newer and npm. Full local streaming requires
Windows, the included `mediamtx.exe`, FFmpeg on `PATH`, reachable RTSP cameras,
and the Blackmagic video/audio capture devices named in `mediamtx.yml`.
Host-side audio playback also uses Windows PowerShell and the included
`nircmd.exe`.

```sh
npm ci
npm run dev              # Express, Vite, and MediaMTX
```

Open `http://localhost:8111`. For UI/API development without starting the
bundled MediaMTX process, use `npm run dev:no-mediamtx`. The preview still
points at the configured VMSP stream hostnames, so this mode does not create
local test streams.

On the Windows streaming PC, build and run with the watchdog:

```sh
npm ci
npm run build
npm run start:watch
```

`start-server.bat` runs the build and watchdog steps from the project folder.
The watchdog restarts the Express server after an unexpected exit; Express
starts MediaMTX and stops it during graceful shutdown. `npm start` runs the
production server without the watchdog. Run `npm run typecheck` to check the
TypeScript and generated React Router types.

### Configuration and credentials

Express loads a local `.env` file through `dotenv`. The file, the OAuth token,
build output, and `node_modules` are ignored by Git.

| Variable | Use |
| --- | --- |
| `PORT` | Express port; defaults to `8111` |
| `SKIP_MEDIAMTX` | Set to `1` to prevent Express from starting MediaMTX |
| `CHMEETINGS_API_KEY` | ChMeetings account key for the server-only calendar feed |
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID for YouTube features |
| `YOUTUBE_CLIENT_SECRET` | Matching OAuth client secret |
| `YOUTUBE_REDIRECT_URI` | OAuth callback URL ending in `/api/yt/callback` |
| `DEFAULT_AUDIO_DEVICE` | Windows sound device restored after host-side audio playback; defaults to `Speakers` |

To connect the YouTube account, configure the three `YOUTUBE_*` values and
visit `/api/yt/auth` on the app host. The callback writes `youtube-token.json`
in the project root; keep that file private. The gear-menu update action edits
an active broadcast, or the first upcoming one if none is active. Available
thumbnail images live in `public/thumbnails/`.

## API and key files

All API routes are mounted under `/api` by [`server/index.ts`](server/index.ts)
before the React Router handler.

| Route | Purpose |
| --- | --- |
| `GET /api/chmeetings/events` | Public seven-day church calendar feed for ScreenTinker |
| `POST /api/page` | Set the shared camera page; body: `{ "page": "main" }` |
| `GET /api/page/current`, `GET /api/page/events` | Read the current page or subscribe to SSE updates |
| `POST /api/restart-mediamtx` | Restart the MediaMTX child process |
| `POST /api/play-audio`, `POST /api/stop-audio`, `GET /api/audio-status` | Play an MP3 on the Windows host and check its status |
| `GET /api/yt/status`, `GET /api/yt/auth`, `GET /api/yt/callback` | YouTube OAuth flow |
| `POST /api/yt/update`, `GET /api/yt/broadcasts`, `GET /api/yt/thumbnails` | Broadcast metadata and available images |
| `POST /api/yt/prepare`, `POST /api/yt/complete` | Prepare a broadcast or check whether it is ready to stream |

The calendar feed reads `CHMEETINGS_API_KEY` from the server's `.env` and returns
only `{ id, title, start, location }` for today and the next six dates in
`America/New_York`. It includes recurring occurrences, refreshes the server
cache periodically, and permits cross-origin GET requests from ScreenTinker.
This endpoint is public: anyone with its URL can read the displayed event
names, times, and locations. Do not put the API key in the widget or commit
it to the repository. After deploying the server with the environment variable,
use `https://remote.vmspchurch.org/api/chmeetings/events` as the widget feed.

`server/page.ts` holds the shared camera selection in memory, so it resets to
`atem` when the server restarts. The browser reconnects to the SSE stream after
a disconnect. `server/youtube.ts` owns the YouTube API calls, while
`server/youtube-auth.ts` stores and refreshes OAuth tokens. `server/audio.ts`
plays host-side MP3 files from `public/audio/`; the browser's audio toggle is a
separate HLS player in `app/components/AudioPlayer.tsx`. The Companion export is
tracked as `vmsp.companionconfig`.

## Troubleshooting

- **No preview:** Check the status badge, the selected stream mode, and the
  MediaMTX output in the Express console (`MTX:` / `MTX ERR:`). For an RTSP
  camera, also check its address in `mediamtx.yml`. For M/V or ATEM audio,
  check that FFmpeg and the named Blackmagic capture device are available.
- **HLS works but RTC does not:** Check TCP port `8189` from the viewer's
  network, then review the VMSP UniFi rule below. WHEP signaling succeeding
  does not prove that direct RTC media can reach the streaming PC.
- **YouTube update fails:** Check `GET /api/yt/status`, the OAuth environment
  variables, and the private `youtube-token.json` file. The update action
  needs an active or upcoming broadcast.
- **Page selection changes after a restart:** The shared selection is held in
  server memory and starts again at `atem`.

## RTC access on the VMSP network

The app uses `https://ptz-rtc.vmspchurch.org/<path>/whep` for WebRTC
signaling. MediaMTX runs on the streaming PC at `192.168.100.252` in the
**Broadcast** network (VLAN 3, `192.168.100.0/24`). Its direct WebRTC media
listener uses TCP/UDP port `8189`; `8889` is the signaling listener behind the
HTTPS endpoint. HLS can work even when the direct RTC media path is blocked.

On 2026-09-27, viewers on the **Default** network (`192.168.0.0/19`) could
reach signaling and play HLS, but RTC failed. The Broadcast network's
**Isolate Network** setting blocked the streaming PC's media replies to
Default. The fix was this rule on `VMSP-Church-UDM` under
**Traffic & Firewall Rules → Advanced → LAN In**:

| Setting | Value |
| --- | --- |
| Name | `Allow RTC replies from MediaMTX to Default` |
| Action / protocol | Accept / TCP/UDP |
| Placement | Before Predefined, above the Broadcast isolation drop rule |
| Source | IP address `192.168.100.252`, source port `8189` |
| Destination | Network `Default`, IPv4 subnet |
| Advanced / Match State | Manual; Established and Related only |

This permits replies for RTC connections initiated from Default while keeping
other Broadcast-to-Default traffic isolated. It does not require exposing
`8889` directly to Default; signaling uses the HTTPS endpoint.

To check the path from a Mac on Default, run
`nc -G 3 -vz 192.168.100.252 8189`, then select RTC in the app and check a
live stream. After the rule was saved, the port check succeeded and the ATEM
and Main streams both played in RTC mode. If the PC's address or the RTC port
changes, update this rule and `mediamtx.yml` together.
