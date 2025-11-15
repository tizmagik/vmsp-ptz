import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, Youtube } from 'lucide-react';
import { ThumbnailSelector } from './ThumbnailSelector';

interface YouTubeUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  thumbnails: string[];
  modalRoot: HTMLElement | null;
}

export function YouTubeUpdateModal({ isOpen, onClose, thumbnails, modalRoot }: YouTubeUpdateModalProps) {
  const [title, setTitle] = useState('');
  const [autoAppendDate, setAutoAppendDate] = useState(true);
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'unlisted'>('public');
  const [status, setStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleUpdate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setStatus('updating');
    setError('');
    
    // Append date if checkbox is checked
    let finalTitle = title;
    if (autoAppendDate) {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      finalTitle = `${title} - ${month}/${day}/${year}`;
    }
    
    try {
      const response = await fetch('/api/yt/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          description: description || undefined,
          thumbnail: thumbnail || undefined,
          privacy,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('success');
        setTimeout(() => {
          setStatus('idle');
          onClose();
          setTitle('');
          setDescription('');
          setThumbnail('');
          setPrivacy('public');
        }, 2000);
      } else {
        setStatus('error');
        setError(data.message || 'Update failed');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error updating YouTube broadcast:', error);
      setStatus('error');
      setError('Network error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  if (!isOpen || !modalRoot) return null;

  return createPortal(
    <div 
      className="modal-overlay"
      onClick={onClose}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Update YouTube Broadcast</h3>
          <button 
            className="modal-close"
            onClick={onClose}
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
            />
            <div style={{ marginTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoAppendDate}
                  onChange={(e) => setAutoAppendDate(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                Auto-append date: {new Date().getMonth() + 1}/{new Date().getDate()}/{new Date().getFullYear()}
              </label>
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="youtube-thumbnail">Thumbnail (optional)</label>
            <ThumbnailSelector
              value={thumbnail}
              onChange={setThumbnail}
              thumbnails={thumbnails}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="youtube-description">Description (optional)</label>
            <textarea
              id="youtube-description"
              placeholder="Enter broadcast description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="form-textarea"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="youtube-privacy">Privacy</label>
            <select
              id="youtube-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'private' | 'unlisted')}
              className="form-input"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button
            className="modal-button"
            onClick={handleUpdate}
            disabled={status === 'updating'}
          >
            {status === 'updating' && (
              <>
                <Loader2 size={16} className="spin-icon" />
                <span>Updating...</span>
              </>
            )}
            {status === 'success' && (
              <>
                <Check size={16} />
                <span>Updated Successfully!</span>
              </>
            )}
            {status === 'error' && (
              <>
                <X size={16} />
                <span>Update Failed</span>
              </>
            )}
            {status === 'idle' && (
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
  );
}
