/**
 * Shared camera configuration
 */

export const CAMERAS = [
  { path: 'atem', label: 'M/V' },
  { path: 'main', label: 'Main' },
  { path: 'left', label: 'Left' },
  { path: 'right', label: 'Right' },
  { path: 'altar', label: 'Altar' },
  { path: 'baptism', label: 'Baptism' },
];

export const VALID_CAMERA_PATHS = CAMERAS.map(c => c.path);
