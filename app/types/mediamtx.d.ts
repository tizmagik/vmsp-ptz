// Type definitions for MediaMTX WebRTC Reader
declare global {
  interface Window {
    MediaMTXWebRTCReader: typeof MediaMTXWebRTCReader;
  }
}

interface MediaMTXWebRTCReaderConfig {
  url: string;
  user?: string;
  pass?: string;
  token?: string;
  onError?: (error: string) => void;
  onTrack?: (event: RTCTrackEvent) => void;
}

declare class MediaMTXWebRTCReader {
  constructor(config: MediaMTXWebRTCReaderConfig);
  close(): void;
}

export {};
