import { Router } from 'express';
import type { Request, Response } from 'express';
import { VALID_CAMERA_PATHS } from '../app/constants/cameras.js';

/**
 * Page selection router
 * Handles POST requests to change the active camera page
 * and provides SSE endpoint for real-time updates
 */

// Store active SSE connections
const clients = new Set<Response>();

// Current page state
let currentPage = 'atem';

export function createPageRouter(): Router {
  const router = Router();

  /**
   * POST /api/page
   * Set the active camera page
   * Body: { page: string } - e.g., "left", "right", "main", etc.
   */
  router.post('/page', (req: Request, res: Response) => {
    const { page } = req.body;

    if (!page || typeof page !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: page field is required',
      });
    }

    const requestedPage = page.toLowerCase();

    // Validate that the page is a recognized camera
    if (!VALID_CAMERA_PATHS.includes(requestedPage)) {
      return res.status(200).json({
        success: false,
        message: `Unrecognized camera page: ${page}. No camera switch performed.`,
        validPages: VALID_CAMERA_PATHS,
      });
    }

    // Update current page
    currentPage = requestedPage;

    // Notify all connected clients
    broadcastPageChange(currentPage);

    res.json({
      success: true,
      page: currentPage,
    });
  });

  /**
   * GET /api/page/events
   * Server-Sent Events endpoint for real-time page updates
   */
  router.get('/page/events', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Add client to set
    clients.add(res);

    // Send initial page
    res.write(`data: ${JSON.stringify({ page: currentPage })}\n\n`);

    // Remove client on disconnect
    req.on('close', () => {
      clients.delete(res);
    });
  });

  /**
   * GET /api/page/current
   * Get the current page (for initial load without SSE)
   */
  router.get('/page/current', (req: Request, res: Response) => {
    res.json({
      page: currentPage,
    });
  });

  return router;
}

/**
 * Broadcast page change to all connected SSE clients
 */
function broadcastPageChange(page: string) {
  const message = `data: ${JSON.stringify({ page })}\n\n`;
  
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (error) {
      // Remove client if write fails
      clients.delete(client);
    }
  });
}
