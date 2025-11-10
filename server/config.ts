import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory (one level up from server/)
export const ROOT_DIR = path.join(__dirname, '..');

// Server configuration
export const PORT = process.env.PORT || 8111;
export const MEDIA_MTX_CFG = 'mediamtx.yml';
export const MEDIA_MTX_EXE = 'mediamtx.exe';

// Paths
export const MEDIAMTX_PATH = path.join(ROOT_DIR, MEDIA_MTX_EXE);
export const MEDIAMTX_CONFIG_PATH = path.join(ROOT_DIR, MEDIA_MTX_CFG);
export const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
export const BUILD_CLIENT_DIR = path.join(ROOT_DIR, 'build', 'client');
