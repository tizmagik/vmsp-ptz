import { useRef, useCallback } from 'react';

interface ResizerProps {
  onResize: (ratio: number) => void;
}

export function Resizer({ onResize }: ResizerProps) {
  const isResizing = useRef(false);

  const startResize = useCallback((clientX: number, clientY: number) => {
    isResizing.current = true;
    const resizer = document.querySelector('.resizer');
    if (resizer) {
      resizer.classList.add('active');
    }
    const isMobile = window.innerWidth <= 767;
    document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize';
  }, []);

  const doResize = useCallback((clientX: number, clientY: number) => {
    if (!isResizing.current) return;
    
    const main = document.querySelector('.main');
    if (!main) return;
    
    const rect = main.getBoundingClientRect();
    const isMobile = window.innerWidth <= 767;
    const ratio = isMobile
      ? (rect.bottom - clientY) / rect.height
      : (clientX - rect.left) / rect.width;
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    
    onResize(clamped);
  }, [onResize]);

  const stopResize = useCallback(() => {
    if (isResizing.current) {
      isResizing.current = false;
      const resizer = document.querySelector('.resizer');
      if (resizer) {
        resizer.classList.remove('active');
      }
      document.body.style.cursor = '';
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startResize(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startResize(touch.clientX, touch.clientY);
  };

  // Set up global event listeners
  useCallback(() => {
    const handleMouseMove = (e: MouseEvent) => doResize(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      doResize(touch.clientX, touch.clientY);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', stopResize);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', stopResize);
    };
  }, [doResize, stopResize]);

  return (
    <div
      className="resizer"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  );
}
