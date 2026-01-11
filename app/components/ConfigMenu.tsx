import { useState, useEffect } from 'react';
import { Settings, RotateCw, Check, X, Loader2, RefreshCw, Youtube } from 'lucide-react';
import { YouTubeUpdateModal } from './YouTubeUpdateModal';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface ConfigMenuProps {
  preferredMode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  thumbnails: string[];
}

export function ConfigMenu({ preferredMode, onModeChange, thumbnails }: ConfigMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'success' | 'error'>('idle');
  const [showYoutubeForm, setShowYoutubeForm] = useState(false);
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setModalRoot(document.body);
  }, []);

  const handleRefreshPage = () => {
    window.location.reload();
  };

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
        setTimeout(() => {
          setRestartStatus('idle');
          handleRefreshPage();
        }, 2000);
      } else {
        setRestartStatus('error');
        setTimeout(() => {
          setRestartStatus('idle');
          handleRefreshPage();
        }, 3000);
      }
    } catch (error) {
      console.error('Error restarting MediaMTX:', error);
      setRestartStatus('error');
      setTimeout(() => {
        setRestartStatus('idle');
        handleRefreshPage();
      }, 3000);
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
            <div className="mode-buttons">
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
              
              <button
                className="restart-button"
                onClick={handleRefreshPage}
              >
                <RefreshCw size={14} />
                <span>Refresh App</span>
              </button>
            </div>
          </div>
          
          <div className="settings-divider"></div>
          
          <div className="settings-section">
            <button
              className="restart-button"
              onClick={() => setShowYoutubeForm(true)}
            >
              <Youtube size={14} />
              <span>Update YouTube Broadcast</span>
            </button>
          </div>
        </div>
      )}
      
      {/* YouTube Update Modal */}
      <YouTubeUpdateModal
        isOpen={showYoutubeForm}
        onClose={() => setShowYoutubeForm(false)}
        thumbnails={thumbnails}
        modalRoot={modalRoot}
      />
    </div>
  );
}
