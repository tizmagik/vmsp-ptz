import { useState, useEffect } from 'react';
import { Settings, RotateCw, Check, X, Loader2, Volume2, VolumeX } from 'lucide-react';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface ConfigMenuProps {
  preferredMode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
}

export function ConfigMenu({ preferredMode, onModeChange }: ConfigMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'success' | 'error'>('idle');
  const [audioStatus, setAudioStatus] = useState<'idle' | 'playing' | 'success' | 'error'>('idle');
  const [currentAudio, setCurrentAudio] = useState<string>('');

  // Check audio status on mount
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const response = await fetch('/api/audio-status');
        const data = await response.json();
        
        if (data.isPlaying && data.currentFile) {
          setAudioStatus('playing');
          setCurrentAudio(data.currentFile.replace('.mp3', ''));
        }
      } catch (error) {
        console.error('Error checking initial audio status:', error);
      }
    };
    
    checkInitialStatus();
  }, []);

  // Poll audio status when playing
  useEffect(() => {
    if (audioStatus !== 'playing') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/audio-status');
        const data = await response.json();
        
        if (!data.isPlaying) {
          setAudioStatus('idle');
          setCurrentAudio('');
        }
      } catch (error) {
        console.error('Error checking audio status:', error);
      }
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, [audioStatus]);

  const handleRestartMediaMTX = async () => {
    if (restartStatus === 'restarting') return;
    
    setRestartStatus('restarting');
    try {
      const response = await fetch('/api/restart-mediamtx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setRestartStatus('success');
        setTimeout(() => setRestartStatus('idle'), 2000);
      } else {
        setRestartStatus('error');
        setTimeout(() => setRestartStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error restarting MediaMTX:', error);
      setRestartStatus('error');
      setTimeout(() => setRestartStatus('idle'), 3000);
    }
  };

  const handlePlayAudio = async (filename: string) => {
    if (audioStatus === 'playing') return;
    
    setAudioStatus('playing');
    setCurrentAudio(filename.replace('.mp3', ''));
    try {
      const response = await fetch('/api/play-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Keep status as 'playing' - user can stop it
        // Will auto-reset when they click stop or audio finishes
      } else {
        setAudioStatus('error');
        setCurrentAudio('');
        setTimeout(() => setAudioStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setAudioStatus('error');
      setCurrentAudio('');
      setTimeout(() => setAudioStatus('idle'), 3000);
    }
  };

  const handleStopAudio = async () => {
    try {
      const response = await fetch('/api/stop-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      setAudioStatus('idle');
      setCurrentAudio('');
    } catch (error) {
      console.error('Error stopping audio:', error);
      setAudioStatus('idle');
      setCurrentAudio('');
    }
  };

  return (
    <div className="settings-container">
      <button 
        className="settings-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Configuration menu"
      >
        <Settings size={16} />
      </button>
      
      {isOpen && (
        <div className="settings-dropdown">
          <div className="settings-section">
            <div className="settings-label">Stream Mode:</div>
            <div className="mode-buttons">
              <button
                className={preferredMode === 'auto' ? 'active' : ''}
                onClick={() => onModeChange('auto')}
              >
                Auto
              </button>
              <button
                className={preferredMode === 'rtc' ? 'active' : ''}
                onClick={() => onModeChange('rtc')}
              >
                RTC
              </button>
              <button
                className={preferredMode === 'hls' ? 'active' : ''}
                onClick={() => onModeChange('hls')}
              >
                HLS
              </button>
            </div>
          </div>
          
          <div className="settings-divider"></div>
          
          <div className="settings-section">
            <button
              className="restart-button"
              onClick={handleRestartMediaMTX}
              disabled={restartStatus === 'restarting'}
            >
              {restartStatus === 'restarting' && (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>Restarting...</span>
                </>
              )}
              {restartStatus === 'success' && (
                <>
                  <Check size={14} />
                  <span>Restarted!</span>
                </>
              )}
              {restartStatus === 'error' && (
                <>
                  <X size={14} />
                  <span>Failed</span>
                </>
              )}
              {restartStatus === 'idle' && (
                <>
                  <RotateCw size={14} />
                  <span>Restart MediaMTX</span>
                </>
              )}
            </button>
          </div>
          
          <div className="settings-divider"></div>
          
          <div className="settings-section">
            <div className="settings-label">
              <Volume2 size={14} style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle' }} />
              Audio:
            </div>
            {audioStatus === 'playing' ? (
              <button
                className="restart-button"
                onClick={handleStopAudio}
              >
                <VolumeX size={14} />
                <span>Stop {currentAudio}</span>
              </button>
            ) : (
              <div className="mode-buttons">
                <button
                  onClick={() => handlePlayAudio('ANNUAL.mp3')}
                  disabled={audioStatus === 'error'}
                >
                  Annual
                </button>
                <button
                  onClick={() => handlePlayAudio('CALLING.mp3')}
                  disabled={audioStatus === 'error'}
                >
                  Calling
                </button>
                <button
                  onClick={() => handlePlayAudio('JOYFUL.mp3')}
                  disabled={audioStatus === 'error'}
                >
                  Joyful
                </button>
                <button
                  onClick={() => handlePlayAudio('MOURNFUL.mp3')}
                  disabled={audioStatus === 'error'}
                >
                  Mournful
                </button>
              </div>
            )}
            {audioStatus === 'error' && (
              <div style={{ color: '#f7a3a3', fontSize: '0.85em', marginTop: '8px' }}>
                Failed to play audio
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
