import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ROOT_DIR } from './config.js';
import { loadChMeetingsEvents } from './chmeetings.js';
import { loadChMeetingsCelebrations } from './chmeetings-celebrations.js';

const PAGE_PATH = path.join(ROOT_DIR, 'st-data', 'events-page.html');

const churchDate = (): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addDays = (key: string, count: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
};

/** Serve the display data inside the HTML; no browser-facing data API is needed. */
export function createEventsPageRouter(): Router {
  const router = Router();

  // ScreenTinker uses HEAD on the same page URL before choosing a local iframe.
  router.head('/events', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.sendStatus(204);
  });

  router.get('/events', async (req, res, next) => {
    try {
      const first = churchDate();
      const last = addDays(first, 6);
      const includeCelebrations = new URL(req.originalUrl, 'http://localhost')
        .searchParams.has('celebrations');
      const celebrations = includeCelebrations ? loadChMeetingsCelebrations(first) : Promise.resolve([]);
      const [widget, eventResult, celebrationResult] = await Promise.all([
        readFile(PAGE_PATH, 'utf8'),
        loadChMeetingsEvents(first, last).then(
          (value) => ({ value }), (error: unknown) => ({ error }),
        ),
        celebrations.then(
          (value) => ({ value }), (error: unknown) => ({ error }),
        ),
      ]);
      if ('error' in eventResult) console.warn('Events page calendar unavailable:', eventResult.error);
      if ('error' in celebrationResult) console.warn('Events page celebrations unavailable:', celebrationResult.error);
      const hasData = 'value' in eventResult ||
        (includeCelebrations && 'value' in celebrationResult);
      const feed = JSON.stringify({
        events: 'value' in eventResult ? eventResult.value : null,
        celebrations: 'value' in celebrationResult ? celebrationResult.value : null,
      }).replace(/</g, '\\u003c');

      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>This week at church · Virgin Mary &amp; St. Pachomius</title>
  <script id="vmsp-feed-data" type="application/json">${feed}</script>
</head>
<body>
${widget.replace(/^\s*<meta charset="utf-8">\s*/, '')}
${hasData ? '<script>window.parent.postMessage({ type: "vmsp-events-ready" }, "*");</script>' : ''}
</body>
</html>`);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
