import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import express from 'express';
import { celebrationsForWeek, createChMeetingsCelebrationsRouter } from './chmeetings-celebrations.js';

const nativeFetch = globalThis.fetch;
const priorKey = process.env.CHMEETINGS_API_KEY;
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map((part) => [part.type, part.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
after(() => {
  globalThis.fetch = nativeFetch;
  if (priorKey === undefined) delete process.env.CHMEETINGS_API_KEY;
  else process.env.CHMEETINGS_API_KEY = priorKey;
});

test('birthdays and anniversaries span New Year without exposing years', () => {
  assert.deepEqual(celebrationsForWeek([
    { id: 1, full_name: 'Mary A', birth_date: '1776-12-31', marriage_date: '2010-01-02' },
    { id: 2, first_name: 'John', last_name: 'B', birth_date: '1990-01-01' },
    { id: 3, full_name: 'Archived', birth_date: '2000-12-30', is_archived: true },
    { id: 4, full_name: 'Outside', birth_date: '1990-01-09' },
  ], '2026-12-29'), [
    { kind: 'birthday', date: '2026-12-31', name: 'Mary A' },
    { kind: 'birthday', date: '2027-01-01', name: 'John B' },
    { kind: 'anniversary', date: '2027-01-02', name: 'Mary A' },
  ]);
});

test('endpoint returns names and dates only, with cached upstream reads', async () => {
  process.env.CHMEETINGS_API_KEY = 'test-only-secret';
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.chmeetings.com');
    assert.equal(url.pathname, '/api/v1/people');
    assert.equal(url.searchParams.get('include_family_members'), 'false');
    assert.equal(url.searchParams.get('include_additional_fields'), 'false');
    assert.equal(url.searchParams.get('include_organizations'), 'false');
    assert.equal((init?.headers as Record<string, string>).apiKey, 'test-only-secret');
    calls++;
    return new Response(JSON.stringify({
      data: [{ id: 1, full_name: 'Maria C', birth_date: `1990-${today.slice(5)}`,
        email: 'private@example.com', mobile: 'private' }],
      paging: { total_count: 1 },
    }), { status: 200 });
  };
  const app = express();
  app.use('/api', createChMeetingsCelebrationsRouter());
  const server = createServer(app).listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/chmeetings/celebrations`;
    const response = await nativeFetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const payload = await response.json() as { celebrations: unknown[] };
    assert.deepEqual(payload.celebrations, [{ kind: 'birthday', date: today, name: 'Maria C' }]);
    assert.equal((await nativeFetch(url)).status, 200);
    assert.equal(calls, 1);
  } finally {
    server.close();
  }
});
