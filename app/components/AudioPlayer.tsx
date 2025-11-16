import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import Hls from 'hls.js';

interface AudioPlayerProps {
  streamUrl: string;
}

export function AudioPlayer({ streamUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('AudioPlayer: Initializing with URL:', streamUrl);

    const handlePlay = () => {
      console.log('Audio started playing');
      setIsPlaying(true);
      setError('');
    };

    const handlePause = () => {
      console.log('Audio paused');
      setIsPlaying(false);
    };

    const handleError = (e: Event) => {
      console.error('Audio element error:', e);
      setError('Failed to load audio');
      setIsPlaying(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    // Check if HLS is natively supported (Safari)
    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('Using native HLS support');
      audio.src = streamUrl;
      // Don't autoplay - wait for user interaction
    } else if (Hls.isSupported()) {
      console.log('Using hls.js');
      // Use hls.js for other browsers
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: false,
      });
      
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      
      // Don't autoplay - wait for user interaction

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          setError(`HLS Error: ${data.type}`);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, attempting to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, attempting to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.log('Fatal error, destroying HLS...');
              hls.destroy();
              break;
          }
        }
      });
    } else {
      console.error('HLS is not supported in this browser');
      setError('Browser not supported');
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.muted = false;
      audio.volume = 1.0;
      audio.play().catch(error => {
        console.error('Failed to play:', error);
        setError('Failed to play');
      });
    }
  };

  return (
    <div className="audio-player">
      <audio ref={audioRef} />
      <div className="audio-controls">
        {error && <span className="audio-error" title={error}>⚠</span>}
        <button
          className="audio-toggle-btn"
          onClick={toggleAudio}
          title={isPlaying ? 'Stop Audio' : 'Play Audio'}
        >
          {isPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
    </div>
  );
}
