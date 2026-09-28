type Person = {
  id?: number | string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  marriage_date?: string | null;
  is_archived?: boolean;
};

export type Celebration = { kind: 'birthday' | 'anniversary'; date: string; name: string };

const API_URL = 'https://api.chmeetings.com/api/v1/people';
const CACHE_TTL_MS = 5 * 60_000;
const FAILURE_RETRY_MS = 60_000;

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

/** Cached names-only celebration lookup. Full People records stay server-side. */
function createCelebrationsFeed() {
  let cache: { first: string; until: number; celebrations: Celebration[] } | undefined;
  let inFlight: { first: string; promise: Promise<Celebration[]> } | undefined;
  let retryAfter = 0;

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
    if (Date.now() < retryAfter) throw new Error('Celebrations feed is cooling down after an upstream failure');
    const promise = (async () => {
      const people = await loadPeople(apiKey);
      const celebrations = celebrationsForWeek(people, first);
      cache = { first, until: Date.now() + CACHE_TTL_MS, celebrations };
      return celebrations;
    })();
    inFlight = { first, promise };
    try {
      return await promise;
    } catch (error) {
      retryAfter = Date.now() + FAILURE_RETRY_MS;
      throw error;
    } finally {
      if (inFlight?.promise === promise) inFlight = undefined;
    }
  }

  return getCelebrations;
}

const celebrationsFeed = createCelebrationsFeed();

export async function loadChMeetingsCelebrations(first: string): Promise<Celebration[]> {
  const apiKey = process.env.CHMEETINGS_API_KEY;
  if (!apiKey) throw new Error('ChMeetings API key is not configured');
  return celebrationsFeed(first, apiKey);
}
