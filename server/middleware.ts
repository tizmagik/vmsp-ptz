import type { Request, Response, NextFunction } from 'express';

/**
 * Disable caching middleware for development
 */
export function disableCaching(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}
