import { useState } from 'react';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface ConfigMenuProps {
  preferredMode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
}

export function ConfigMenu({ preferredMode, onModeChange }: ConfigMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'success' | 'error'>('idle');

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

  return (
    <div className="settings-container">
      <button 
        className="settings-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Configuration menu"
      >
        ⚙️
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
              {restartStatus === 'restarting' && '⏳ Restarting...'}
              {restartStatus === 'success' && '✅ Restarted!'}
              {restartStatus === 'error' && '❌ Failed'}
              {restartStatus === 'idle' && '🔄 Restart MediaMTX'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
