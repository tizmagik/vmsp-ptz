import { Router } from 'express';

type ApiEvent = {
  id: string | number;
  title?: string;
  start_date?: string;
  schedule?: { all_day?: boolean; start_time?: string };
  recurrence?: { end_date?: string };
  location?: { name?: string; formatted_address?: string };
};

type ApiOccurrence = {
  occurrence_id?: string | number;
  title?: string;
  start?: string;
};

type DisplayEvent = { id: string; title: string; start: string; location: string };

const API_BASE = 'https://api.chmeetings.com/api/v1';
const SERIES_SEARCH_START = '2016-01-01';
const MASTER_TTL_MS = 5 * 60_000;
const FEED_TTL_MS = 60_000;

const addDays = (key: string, count: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
};

const churchDate = (date: Date): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const locationOf = (event: ApiEvent): string =>
  event.location?.name?.trim() || event.location?.formatted_address?.trim() || '';

/** Public event feed for the ScreenTinker sign. The ChMeetings key stays server-side. */
export function createChMeetingsRouter(): Router {
  const router = Router();
  let masterCache: { last: string; until: number; events: ApiEvent[] } | undefined;
  let masterInFlight: { last: string; promise: Promise<ApiEvent[]> } | undefined;
  let feedCache: { first: string; until: number; events: DisplayEvent[] } | undefined;
  let feedInFlight: { first: string; promise: Promise<DisplayEvent[]> } | undefined;

  async function getPaged<T>(path: string, query: Record<string, string>, apiKey: string): Promise<T[]> {
    const results: T[] = [];
    for (let page = 1; page <= 1000; page++) {
      const url = new URL(API_BASE + path);
      Object.entries({ ...query, page, page_size: 100 }).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
      const response = await fetch(url, {
        headers: { apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`ChMeetings returned HTTP ${response.status}`);
      const payload = await response.json() as { data?: T[]; paging?: { total_count?: number } };
      if (!Array.isArray(payload.data)) throw new Error('Unexpected ChMeetings response');
      results.push(...payload.data);
      const total = Number(payload.paging?.total_count);
      if ((Number.isFinite(total) && results.length >= total) || payload.data.length < 100) return results;
    }
    throw new Error('ChMeetings page limit reached');
  }

  async function getMasters(last: string, apiKey: string): Promise<ApiEvent[]> {
    if (masterCache && last <= masterCache.last && Date.now() < masterCache.until) return masterCache.events;
    if (masterInFlight?.last === last) return masterInFlight.promise;
    const promise = (async () => {
      const masters = new Map<string, ApiEvent>();
      let windowStart = SERIES_SEARCH_START;
      while (windowStart <= last) {
        const end = addDays(windowStart, 365);
        const windowEnd = end < last ? end : last;
        const batch = await getPaged<ApiEvent>('/events', { from: windowStart, to: windowEnd }, apiKey);
        for (const event of batch) if (event?.id != null) masters.set(String(event.id), event);
        windowStart = addDays(windowEnd, 1);
      }
      const events = [...masters.values()];
      masterCache = { last, until: Date.now() + MASTER_TTL_MS, events };
      return events;
    })();
    masterInFlight = { last, promise };
    try {
      return await promise;
    } finally {
      if (masterInFlight?.promise === promise) masterInFlight = undefined;
    }
  }

  async function getFeed(first: string, last: string, apiKey: string): Promise<DisplayEvent[]> {
    if (feedCache?.first === first && Date.now() < feedCache.until) return feedCache.events;
    if (feedInFlight?.first === first) return feedInFlight.promise;
    const promise = (async () => {
      const masters = await getMasters(last, apiKey);
      const result: DisplayEvent[] = [];
      const recurring: ApiEvent[] = [];
      for (const event of masters) {
        if (!event.title || !event.start_date) continue;
        if (event.recurrence) {
          if (event.start_date <= last && (!event.recurrence.end_date || event.recurrence.end_date >= first)) {
            recurring.push(event);
          }
        } else if (event.start_date >= first && event.start_date <= last) {
          result.push({
            id: String(event.id), title: event.title,
            start: event.schedule?.all_day || !event.schedule?.start_time
              ? event.start_date : `${event.start_date}T${event.schedule.start_time}`,
            location: locationOf(event),
          });
        }
      }

      let next = 0;
      const workers = Array.from({ length: Math.min(6, recurring.length) }, async () => {
        while (next < recurring.length) {
          const event = recurring[next++];
          const occurrences = await getPaged<ApiOccurrence>(
            `/events/${encodeURIComponent(event.id)}/occurrences`, { from: first, to: last }, apiKey,
          );
          for (const occurrence of occurrences) {
            if (!occurrence.start) continue;
            result.push({
              id: String(occurrence.occurrence_id || `${event.id}:${occurrence.start}`),
              title: occurrence.title || event.title!, start: occurrence.start,
              location: locationOf(event),
            });
          }
        }
      });
      await Promise.all(workers);
      feedCache = { first, until: Date.now() + FEED_TTL_MS, events: result };
      return result;
    })();
    feedInFlight = { first, promise };
    try {
      return await promise;
    } finally {
      if (feedInFlight?.promise === promise) feedInFlight = undefined;
    }
  }

  router.get('/chmeetings/events', async (_req, res) => {
    // The sign is cross-origin. The response is intentionally a public, reduced feed.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    const apiKey = process.env.CHMEETINGS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Calendar feed is not configured.' });
      return;
    }
    const first = churchDate(new Date());
    const last = addDays(first, 6);
    try {
      res.json({ first, last, events: await getFeed(first, last, apiKey) });
    } catch (error) {
      console.error('Failed to refresh ChMeetings calendar feed:', error);
      res.status(502).json({ error: 'Calendar feed is temporarily unavailable.' });
    }
  });

  return router;
}
