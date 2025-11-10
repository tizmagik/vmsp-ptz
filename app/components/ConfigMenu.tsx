import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, RotateCw, Check, X, Loader2, RefreshCw, Youtube } from 'lucide-react';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface ConfigMenuProps {
  preferredMode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
}

export function ConfigMenu({ preferredMode, onModeChange }: ConfigMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'success' | 'error'>('idle');
  const [showYoutubeForm, setShowYoutubeForm] = useState(false);
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeDescription, setYoutubeDescription] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
  const [youtubeError, setYoutubeError] = useState('');
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setModalRoot(document.body);
  }, []);

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

  const handleRefreshPage = () => {
    window.location.reload();
  };

  const handleUpdateYoutube = async () => {
    if (!youtubeTitle.trim()) {
      setYoutubeError('Title is required');
      return;
    }

    setYoutubeStatus('updating');
    setYoutubeError('');
    
    try {
      const response = await fetch('/api/yt/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: youtubeTitle,
          description: youtubeDescription || undefined,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setYoutubeStatus('success');
        setTimeout(() => {
          setYoutubeStatus('idle');
          setShowYoutubeForm(false);
          setYoutubeTitle('');
          setYoutubeDescription('');
        }, 2000);
      } else {
        setYoutubeStatus('error');
        setYoutubeError(data.message || 'Update failed');
        setTimeout(() => setYoutubeStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error updating YouTube broadcast:', error);
      setYoutubeStatus('error');
      setYoutubeError('Network error');
      setTimeout(() => setYoutubeStatus('idle'), 3000);
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
      {showYoutubeForm && modalRoot && createPortal(
        <div 
          className="modal-overlay"
          onClick={() => setShowYoutubeForm(false)}
        >
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Update YouTube Broadcast</h3>
              <button 
                className="modal-close"
                onClick={() => setShowYoutubeForm(false)}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="youtube-title">Title *</label>
                <input
                  id="youtube-title"
                  type="text"
                  placeholder="Enter broadcast title"
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  className="form-input"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="youtube-description">Description (optional)</label>
                <textarea
                  id="youtube-description"
                  placeholder="Enter broadcast description"
                  value={youtubeDescription}
                  onChange={(e) => setYoutubeDescription(e.target.value)}
                  rows={4}
                  className="form-textarea"
                />
              </div>
              
              {youtubeError && (
                <div className="error-message">
                  {youtubeError}
                </div>
              )}
              
              <button
                className="modal-button"
                onClick={handleUpdateYoutube}
                disabled={youtubeStatus === 'updating'}
              >
                {youtubeStatus === 'updating' && (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>Updating...</span>
                  </>
                )}
                {youtubeStatus === 'success' && (
                  <>
                    <Check size={16} />
                    <span>Updated Successfully!</span>
                  </>
                )}
                {youtubeStatus === 'error' && (
                  <>
                    <X size={16} />
                    <span>Update Failed</span>
                  </>
                )}
                {youtubeStatus === 'idle' && (
                  <>
                    <Youtube size={16} />
                    <span>Update Broadcast</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        modalRoot
      )}
    </div>
  );
}
