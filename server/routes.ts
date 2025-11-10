import { Router } from 'express';
import { createMediaMTXRouter } from './mediamtx.js';
import { createAudioRouter } from './audio.js';
import { createYouTubeRouter } from './youtube.js';

/**
 * Combine all module routers into a single API router
 */
export function createAPIRouter(): Router {
  const router = Router();

  // Mount module routers
  router.use(createMediaMTXRouter());
  router.use(createAudioRouter());
  router.use(createYouTubeRouter());

  return router;
}

