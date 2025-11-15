import { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaMTXWebRTC } from 'mediamtx-webrtc-react';

const RTC_BASE_URL = 'https://ptz-rtc.vmspchurch.org';
const HLS_BASE_URL = 'https://ptz-hls.vmspchurch.org';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface VideoPlayerProps {
  path: string;
  preferredMode: StreamMode;
  onStatusChange: (status: 'loading' | 'success' | 'error', message: string) => void;
}

export function VideoPlayer({ path, preferredMode, onStatusChange }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [useHLSOnly, setUseHLSOnly] = useState(false);
  const [shouldUseRTC, setShouldUseRTC] = useState(true);
  const fallbackTimeoutRef = useRef<number | null>(null);
  const videoPlayingRef = useRef(false);

  // Stabilize onStatusChange to prevent infinite loops
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Stable error handler
  const handleError = useCallback((err: string) => {
    console.error('WebRTC error:', err);
    onStatusChangeRef.current('error', `RTC failed: ${path}`);
    
    // Fallback to HLS on error in auto mode
    if (preferredMode === 'auto') {
      console.log('Falling back to HLS due to RTC error');
      setUseHLSOnly(true);
    }
  }, [path, preferredMode]);

  // Determine if we should use RTC based on mode
  useEffect(() => {
    if (preferredMode === 'hls') {
      setShouldUseRTC(false);
    } else if (preferredMode === 'rtc') {
      setShouldUseRTC(true);
    } else {
      // Auto mode
      setShouldUseRTC(!useHLSOnly);
    }
  }, [preferredMode, useHLSOnly]);

  // Use the MediaMTX WebRTC hook
  const {
    videoRef,
    connectionState,
    error,
    isConnected,
  } = useMediaMTXWebRTC({
    url: shouldUseRTC ? `${RTC_BASE_URL}/${path}/whep` : '',
    onError: handleError,
  });

  // Monitor video element for actual playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldUseRTC) {
      videoPlayingRef.current = false;
      return;
    }

    const handlePlaying = () => {
      console.log('Video is actually playing');
      videoPlayingRef.current = true;
      // Update status to success when video starts playing
      onStatusChangeRef.current('success', `Live: ${path} (RTC)`);
      // Clear fallback timeout since video is playing
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };

    const handleStalled = () => {
      console.log('Video stalled');
      videoPlayingRef.current = false;
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('suspend', handleStalled);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('suspend', handleStalled);
    };
  }, [videoRef, shouldUseRTC, path]);

  // Update status based on connection state
  useEffect(() => {
    // Clear any existing timeout
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    if (!shouldUseRTC) {
      // Using HLS
      if (iframeRef.current) {
        iframeRef.current.style.display = 'block';
        iframeRef.current.src = `${HLS_BASE_URL}/${path}`;
      }
      if (videoRef.current) {
        videoRef.current.style.display = 'none';
      }
      onStatusChangeRef.current('success', `Live: ${path} (HLS)`);
    } else {
      // Using RTC
      if (videoRef.current) {
        videoRef.current.style.display = 'block';
      }
      if (iframeRef.current) {
        iframeRef.current.style.display = 'none';
      }

      // Always set a fallback timeout in auto mode when trying RTC
      if (preferredMode === 'auto' && !fallbackTimeoutRef.current && !videoPlayingRef.current) {
        console.log('Setting fallback timeout for RTC connection');
        fallbackTimeoutRef.current = window.setTimeout(() => {
          console.log('Fallback timeout triggered - video not playing');
          if (!videoPlayingRef.current) {
            console.warn('RTC timeout - video not playing, falling back to HLS');
            setUseHLSOnly(true);
          }
        }, 8000);
      }

      if (connectionState === 'getting_codecs' || connectionState === 'running') {
        if (!isConnected) {
          onStatusChangeRef.current('loading', `Loading: ${path} (RTC)`);
        }
      }
      
      if (isConnected && videoPlayingRef.current) {
        onStatusChangeRef.current('success', `Live: ${path} (RTC)`);
      }
      
      if (error) {
        console.log('RTC error detected in status effect');
        onStatusChangeRef.current('error', `RTC failed: ${path}`);
        // Trigger fallback on error in auto mode
        if (preferredMode === 'auto') {
          setUseHLSOnly(true);
        }
      }
    }

    return () => {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };
  }, [shouldUseRTC, connectionState, isConnected, error, path, videoRef, preferredMode]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        muted={false}
        style={{ display: shouldUseRTC ? 'block' : 'none' }}
      />
      <iframe
        ref={iframeRef}
        className="companion-frame"
        style={{ display: shouldUseRTC ? 'none' : 'block' }}
        title="HLS Stream"
      />
    </>
  );
}
