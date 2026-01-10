import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
// In development: use __dirname relative path (server is in project root)
// In production: use process.cwd() since npm scripts always run from project root
const isDev = process.env.NODE_ENV !== 'production';
export const ROOT_DIR = isDev
  ? path.join(__dirname, '..')
  : process.cwd();

// Server configuration
export const PORT = process.env.PORT || 8111;
export const MEDIA_MTX_CFG = 'mediamtx.yml';
export const MEDIA_MTX_EXE = 'mediamtx.exe';

// Paths
export const MEDIAMTX_PATH = path.join(ROOT_DIR, MEDIA_MTX_EXE);
export const MEDIAMTX_CONFIG_PATH = path.join(ROOT_DIR, MEDIA_MTX_CFG);
export const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
export const BUILD_CLIENT_DIR = path.join(ROOT_DIR, 'build', 'client');

// Thumbnails directory - works in both dev and production
export const THUMBNAILS_DIR = path.join(ROOT_DIR, 'public', 'thumbnails');
