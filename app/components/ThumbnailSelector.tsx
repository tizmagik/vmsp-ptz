import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface ThumbnailSelectorProps {
  value: string;
  onChange: (thumbnail: string) => void;
  thumbnails: string[];
}

export function ThumbnailSelector({ value, onChange, thumbnails }: ThumbnailSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (selectorRef.current && !selectorRef.current.contains(target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside as EventListener);
      document.addEventListener('touchstart', handleClickOutside as EventListener);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside as EventListener);
        document.removeEventListener('touchstart', handleClickOutside as EventListener);
      };
    }
  }, [showDropdown]);

  return (
    <div className="thumbnail-selector" ref={selectorRef}>
      <div 
        className="thumbnail-preview-box"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {value ? (
          <>
            <img 
              src={`/thumbnails/${value}`} 
              alt={value}
              className="thumbnail-preview-image"
            />
            <span className="thumbnail-preview-name">{value}</span>
          </>
        ) : (
          <span className="thumbnail-preview-placeholder">(no change)</span>
        )}
        <ChevronDown size={18} className="thumbnail-dropdown-icon" />
      </div>
      
      {showDropdown && (
        <div 
          className="thumbnail-dropdown"
          onTouchMove={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div 
            className="thumbnail-option"
            onClick={() => {
              onChange('');
              setShowDropdown(false);
            }}
          >
            <span className="thumbnail-option-text">(no change)</span>
          </div>
          {thumbnails.map((thumbnail) => (
            <div
              key={thumbnail}
              className="thumbnail-option"
              onClick={() => {
                onChange(thumbnail);
                setShowDropdown(false);
              }}
            >
              <img 
                src={`/thumbnails/${thumbnail}`} 
                alt={thumbnail}
                className="thumbnail-option-image"
              />
              <span className="thumbnail-option-text">{thumbnail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
