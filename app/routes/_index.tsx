import { useState, useEffect } from 'react';
import { CameraButtons } from '~/components/CameraButtons';
import { ConfigMenu } from '~/components/ConfigMenu';
import { StatusIndicator } from '~/components/StatusIndicator';
import { VideoPlayer } from '~/components/VideoPlayer';
import { Resizer } from '~/components/Resizer';
import { CAMERAS } from '~/constants/cameras';
import { listThumbnails } from '../../server/youtube.js';
import type { Route } from './+types/_index';

type StreamMode = 'auto' | 'rtc' | 'hls';
type StatusType = 'loading' | 'success' | 'error';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'VMSP Remote' },
    { name: 'description', content: 'PTZ Camera Control' },
  ];
}

export async function loader() {
  const thumbnails = listThumbnails();
  return { thumbnails };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const [currentPath, setCurrentPath] = useState('atem');
  const [preferredMode, setPreferredMode] = useState<StreamMode>('auto');
  const [status, setStatus] = useState<StatusType>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading...');
  const [videoRatio, setVideoRatio] = useState(60);

  // Listen for page selection events from the server with auto-reconnect
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isComponentMounted = true;

    const connect = () => {
      // Clean up existing connection
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/page/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.page) {
            setCurrentPath(data.page);
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error, will attempt to reconnect...', error);
        
        if (eventSource) {
          eventSource.close();
        }

        // Attempt to reconnect after 2 seconds if component is still mounted
        if (isComponentMounted) {
          reconnectTimeout = setTimeout(() => {
            console.log('Reconnecting SSE...');
            connect();
          }, 2000);
        }
      };

      eventSource.onopen = () => {
        console.log('SSE connection established');
      };
    };

    // Initial connection
    connect();

    return () => {
      isComponentMounted = false;
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

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
          thumbnails={loaderData.thumbnails}
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
