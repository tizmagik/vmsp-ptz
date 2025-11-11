import { useState, useEffect } from 'react';
import { CameraButtons } from '~/components/CameraButtons';
import { ConfigMenu } from '~/components/ConfigMenu';
import { StatusIndicator } from '~/components/StatusIndicator';
import { VideoPlayer } from '~/components/VideoPlayer';
import { Resizer } from '~/components/Resizer';
import type { Route } from './+types/_index';

type StreamMode = 'auto' | 'rtc' | 'hls';
type StatusType = 'loading' | 'success' | 'error';

const CAMERAS = [
  { path: 'mv', label: 'MV' },
  { path: 'main', label: 'Main' },
  { path: 'left', label: 'Left' },
  { path: 'right', label: 'Right' },
  { path: 'altar', label: 'Altar' },
  { path: 'baptism', label: 'Baptism' },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'VMSP Remote' },
    { name: 'description', content: 'PTZ Camera Control' },
  ];
}

export default function Index() {
  const [currentPath, setCurrentPath] = useState('mv');
  const [preferredMode, setPreferredMode] = useState<StreamMode>('auto');
  const [status, setStatus] = useState<StatusType>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading...');
  const [videoRatio, setVideoRatio] = useState(60);

  const handleStatusChange = (newStatus: StatusType, message: string) => {
    setStatus(newStatus);
    setStatusMessage(message);
  };

  const handleResize = (ratio: number) => {
    const isMobile = window.innerWidth <= 767;
    if (isMobile) {
      setVideoRatio(100 - ratio * 100);
    } else {
      setVideoRatio(ratio * 100);
    }
  };

  useEffect(() => {
    const handleWindowResize = () => {
      // Reset to default on window resize
      setVideoRatio(60);
    };
    
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  return (
    <div className="main" id="main">
      <div 
        className="panel video-panel" 
        style={{ flex: `1 1 ${videoRatio}%` }}
      >
        <CameraButtons
          cameras={CAMERAS}
          currentPath={currentPath}
          onCameraChange={setCurrentPath}
        />
        <ConfigMenu
          preferredMode={preferredMode}
          onModeChange={setPreferredMode}
        />
        <VideoPlayer
          path={currentPath}
          preferredMode={preferredMode}
          onStatusChange={handleStatusChange}
        />
        <StatusIndicator status={status} message={statusMessage} />
      </div>
      
      <Resizer onResize={handleResize} />
      
      <div 
        className="panel companion-panel"
        style={{ flex: `1 1 ${100 - videoRatio}%` }}
      >
        <iframe
          className="companion-frame"
          src="https://ptz-companion.vmspchurch.org/emulator/upY2sQgNt-otH-JXfXeAl"
          title="Companion"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        />
      </div>
    </div>
  );
}
