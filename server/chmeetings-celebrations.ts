import { Router } from 'express';

type Person = {
  id?: number | string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  marriage_date?: string | null;
  is_archived?: boolean;
};

type Celebration = { kind: 'birthday' | 'anniversary'; date: string; name: string };

const API_URL = 'https://api.chmeetings.com/api/v1/people';
const CACHE_TTL_MS = 5 * 60_000;

const churchDate = (date: Date): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addDays = (key: string, count: number): string => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
};

export function celebrationsForWeek(people: Person[], first: string): Celebration[] {
  const days = new Map<string, string>();
  for (let offset = 0; offset < 7; offset++) {
    const day = addDays(first, offset);
    days.set(day.slice(5), day);
  }
  const unique = new Map<string, Celebration>();
  for (const person of people) {
    if (person.is_archived) continue;
    const name = (person.full_name?.trim() ||
      [person.first_name, person.last_name].filter(Boolean).join(' ').trim());
    if (!name) continue;
    for (const [kind, value] of [
      ['birthday', person.birth_date], ['anniversary', person.marriage_date],
    ] as const) {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
      const day = days.get(value.slice(5));
      if (!day) continue;
      const item: Celebration = { kind, date: day, name };
      unique.set(`${kind}:${day}:${person.id ?? name}`, item);
    }
  }
  return [...unique.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** Public names-only celebration feed. Full People records never leave this server. */
export function createChMeetingsCelebrationsRouter(): Router {
  const router = Router();
  let cache: { first: string; until: number; celebrations: Celebration[] } | undefined;
  let inFlight: { first: string; promise: Promise<Celebration[]> } | undefined;

  async function loadPeople(apiKey: string): Promise<Person[]> {
    const people: Person[] = [];
    for (let page = 1; page <= 1000; page++) {
      const url = new URL(API_URL);
      Object.entries({
        include_family_members: 'false',
        include_additional_fields: 'false',
        include_organizations: 'false',
        page: String(page),
        page_size: '100',
      }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, {
        headers: { apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`ChMeetings returned HTTP ${response.status}`);
      const payload = await response.json() as { data?: Person[]; paging?: { total_count?: number } };
      if (!Array.isArray(payload.data)) throw new Error('Unexpected ChMeetings people response');
      people.push(...payload.data);
      const total = Number(payload.paging?.total_count);
      if ((Number.isFinite(total) && people.length >= total) || payload.data.length < 100) return people;
    }
    throw new Error('ChMeetings people page limit reached');
  }

  async function getCelebrations(first: string, apiKey: string): Promise<Celebration[]> {
    if (cache?.first === first && Date.now() < cache.until) return cache.celebrations;
    if (inFlight?.first === first) return inFlight.promise;
    const promise = (async () => {
      const people = await loadPeople(apiKey);
      const celebrations = celebrationsForWeek(people, first);
      cache = { first, until: Date.now() + CACHE_TTL_MS, celebrations };
      return celebrations;
    })();
    inFlight = { first, promise };
    try {
      return await promise;
    } finally {
      if (inFlight?.promise === promise) inFlight = undefined;
    }
  }

  router.get('/chmeetings/celebrations', async (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    const apiKey = process.env.CHMEETINGS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Celebrations feed is not configured.' });
      return;
    }
    const first = churchDate(new Date());
    try {
      res.json({ first, last: addDays(first, 6), celebrations: await getCelebrations(first, apiKey) });
    } catch (error) {
      console.error('Failed to refresh ChMeetings celebrations feed:', error);
      res.status(502).json({ error: 'Celebrations feed is temporarily unavailable.' });
    }
  });

  return router;
}
