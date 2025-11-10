import { useState, useRef, useEffect } from 'react';

type StreamMode = 'auto' | 'rtc' | 'hls';

interface SettingsMenuProps {
  preferredMode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
}

export function SettingsMenu({ preferredMode, onModeChange }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleModeClick = (mode: StreamMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  return (
    <div className="settings-container" ref={menuRef}>
      <div
        className="settings-icon"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        ⚙
      </div>
      <div className={`settings-menu ${isOpen ? 'show' : ''}`}>
        <div
          className={`settings-item ${preferredMode === 'auto' ? 'active' : ''}`}
          onClick={() => handleModeClick('auto')}
        >
          <span className="checkmark">✓</span>
          <span>Auto</span>
        </div>
        <div
          className={`settings-item ${preferredMode === 'rtc' ? 'active' : ''}`}
          onClick={() => handleModeClick('rtc')}
        >
          <span className="checkmark">✓</span>
          <span>RTC</span>
        </div>
        <div
          className={`settings-item ${preferredMode === 'hls' ? 'active' : ''}`}
          onClick={() => handleModeClick('hls')}
        >
          <span className="checkmark">✓</span>
          <span>HLS</span>
        </div>
      </div>
    </div>
  );
}
