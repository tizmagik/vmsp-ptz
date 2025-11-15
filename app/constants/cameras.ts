/**
 * Shared camera configuration
 */

export const CAMERAS = [
  { path: 'atem', label: 'M/V' },
  { path: 'main', label: 'Main' },
  { path: 'left', label: 'Left' },
  { path: 'right', label: 'Rght' },
  { path: 'altar', label: 'Altr' },
  { path: 'baptism', label: 'Bapt' },
  { path: 'basement', label: 'Bsmt' },
];

export const VALID_CAMERA_PATHS = CAMERAS.map(c => c.path);
