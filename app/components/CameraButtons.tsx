interface Camera {
  path: string;
  label: string;
}

interface CameraButtonsProps {
  cameras: Camera[];
  currentPath: string;
  onCameraChange: (path: string) => void;
}

export function CameraButtons({ cameras, currentPath, onCameraChange }: CameraButtonsProps) {
  return (
    <div className="cam-buttons">
      {cameras.map((camera) => (
        <button
          key={camera.path}
          className={`cam-btn ${currentPath === camera.path ? 'active' : ''}`}
          onClick={() => onCameraChange(camera.path)}
        >
          {camera.label}
        </button>
      ))}
    </div>
  );
}
