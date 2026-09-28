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

export type DisplayEvent = { id: string; title: string; start: string; location: string };

const API_BASE = 'https://api.chmeetings.com/api/v1';
const SERIES_SEARCH_START = '2016-01-01';
const MASTER_TTL_MS = 5 * 60_000;
const FEED_TTL_MS = 5 * 60_000;
const FAILURE_RETRY_MS = 60_000;

const addDays = (key: string, count: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
};

const locationOf = (event: ApiEvent): string =>
  event.location?.name?.trim() || event.location?.formatted_address?.trim() || '';

/** Cached ChMeetings event lookup. The API key stays server-side. */
function createCalendarFeed() {
  let masterCache: { last: string; until: number; events: ApiEvent[] } | undefined;
  let masterInFlight: { last: string; promise: Promise<ApiEvent[]> } | undefined;
  let feedCache: { first: string; until: number; events: DisplayEvent[] } | undefined;
  let feedInFlight: { first: string; promise: Promise<DisplayEvent[]> } | undefined;
  let retryAfter = 0;

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
    if (Date.now() < retryAfter) throw new Error('Calendar feed is cooling down after an upstream failure');
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
    } catch (error) {
      retryAfter = Date.now() + FAILURE_RETRY_MS;
      throw error;
    } finally {
      if (feedInFlight?.promise === promise) feedInFlight = undefined;
    }
  }

  return getFeed;
}

const calendarFeed = createCalendarFeed();

export async function loadChMeetingsEvents(first: string, last: string): Promise<DisplayEvent[]> {
  const apiKey = process.env.CHMEETINGS_API_KEY;
  if (!apiKey) throw new Error('ChMeetings API key is not configured');
  return calendarFeed(first, last, apiKey);
}
