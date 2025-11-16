import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import Hls from 'hls.js';

interface AudioPlayerProps {
  streamUrl: string;
}

export function AudioPlayer({ streamUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isMuted, setIsMuted] = useState(true); // Start muted to allow autoplay
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string>('');
  const [autoplayAttempted, setAutoplayAttempted] = useState(false);

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
      audio.muted = true; // Start muted for autoplay
      audio.play().then(() => {
        console.log('Audio autoplay successful (muted)');
        setAutoplayAttempted(true);
      }).catch(error => {
        console.log('Audio autoplay prevented:', error);
        setError('Click play to start');
      });
    } else if (Hls.isSupported()) {
      console.log('Using hls.js');
      // Use hls.js for other browsers
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        debug: true,
      });
      
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed, attempting to play');
        audio.muted = true; // Start muted for autoplay
        audio.play().then(() => {
          console.log('Audio autoplay successful (muted)');
          setAutoplayAttempted(true);
        }).catch(error => {
          console.log('Audio autoplay prevented:', error);
          setError('Click play to start');
        });
      });

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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(error => {
        console.error('Failed to play:', error);
        setError('Failed to play');
      });
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.muted = false;
      setIsMuted(false);
    }
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        muted={isMuted}
      />
      <div className="audio-controls">
        <button
          className="audio-mute-btn"
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className={`audio-mute-btn ${autoplayAttempted && isMuted ? 'audio-unmute-hint' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute (audio is playing muted)' : 'Mute'}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        {error && <span className="audio-error" title={error}>⚠</span>}
      </div>
    </div>
  );
}
