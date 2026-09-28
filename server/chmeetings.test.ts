import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import express from 'express';
import { createChMeetingsRouter } from './chmeetings.js';

const nativeFetch = globalThis.fetch;
const priorKey = process.env.CHMEETINGS_API_KEY;
after(() => {
  globalThis.fetch = nativeFetch;
  if (priorKey === undefined) delete process.env.CHMEETINGS_API_KEY;
  else process.env.CHMEETINGS_API_KEY = priorKey;
});

const localDay = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

test('public feed returns only display fields and reuses cached upstream data', async () => {
  const day = localDay();
  const calls: URL[] = [];
  process.env.CHMEETINGS_API_KEY = 'test-only-secret';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.chmeetings.com');
    assert.equal((init?.headers as Record<string, string>).apiKey, 'test-only-secret');
    assert.equal(url.searchParams.has('apiKey'), false);
    calls.push(url);
    if (url.pathname.endsWith('/occurrences')) {
      return new Response(JSON.stringify({ data: [
        { occurrence_id: 'occ-1', title: 'Weekly service', start: `${day}T09:00:00`, private: 'omit' },
      ], paging: { total_count: 1 } }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [
      {
        id: 1, title: 'Bible study', start_date: day,
        schedule: { start_time: '19:00:00' },
        location: { name: 'Main church' }, confidential: 'omit',
      },
      {
        id: 2, title: 'Weekly service', start_date: '2016-01-01',
        recurrence: {}, location: { formatted_address: 'Parish hall' }, confidential: 'omit',
      },
    ], paging: { total_count: 2 } }), { status: 200 });
  };

  const app = express();
  app.use('/api', createChMeetingsRouter());
  const server = createServer(app).listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/chmeetings/events`;
    const first = await nativeFetch(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('access-control-allow-origin'), '*');
    const feed = await first.json() as { first: string; events: Record<string, string>[] };
    assert.equal(feed.first, day);
    assert.deepEqual(feed.events.find((event) => event.id === '1'), {
      id: '1', title: 'Bible study', start: `${day}T19:00:00`, location: 'Main church',
    });
    assert.deepEqual(feed.events.find((event) => event.id === 'occ-1'), {
      id: 'occ-1', title: 'Weekly service', start: `${day}T09:00:00`, location: 'Parish hall',
    });
    const count = calls.length;
    assert.ok(count > 1);
    assert.equal((await nativeFetch(url)).status, 200);
    assert.equal(calls.length, count);
  } finally {
    server.close();
  }
});

test('missing key returns a controlled configuration error', async () => {
  delete process.env.CHMEETINGS_API_KEY;
  const app = express();
  app.use('/api', createChMeetingsRouter());
  const server = createServer(app).listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await nativeFetch(`http://127.0.0.1:${address.port}/api/chmeetings/events`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Calendar feed is not configured.' });
  } finally {
    server.close();
  }
});
