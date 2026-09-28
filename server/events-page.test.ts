import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { createEventsPageRouter } from './events-page.js';
import { createAPIRouter } from './routes.js';

const nativeFetch = globalThis.fetch;

const localDay = (): string => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

test('/events embeds display data and caches ChMeetings reads for five minutes', async () => {
  const priorKey = process.env.CHMEETINGS_API_KEY;
  const priorNow = Date.now;
  let now = priorNow();
  const calls: string[] = [];
  const day = localDay();
  process.env.CHMEETINGS_API_KEY = 'test-only-secret';
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.chmeetings.com');
    calls.push(url.pathname);
    const data = url.pathname.endsWith('/people')
      ? [{ id: 1, full_name: 'Test Birthday', birth_date: day, marriage_date: day }]
      : [{ id: 1, title: 'Test Event', start_date: day, schedule: { start_time: '09:00:00' } }];
    return new Response(JSON.stringify({ data, paging: { total_count: data.length } }), { status: 200 });
  };

  const app = express();
  app.use('/api', createAPIRouter());
  app.use(createEventsPageRouter());
  const server = createServer(app).listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const getPage = async (suffix = '') => {
      const response = await nativeFetch(`${base}/events${suffix}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') || '', /^text\/html/);
      return response.text();
    };
    const defaultHtml = await getPage();
    const defaultFeed = JSON.parse(defaultHtml.match(/<script id="vmsp-feed-data" type="application\/json">([^<]*)<\/script>/)?.[1] || 'null');
    assert.deepEqual(defaultFeed.celebrations, []);
    assert.equal(calls.filter((path) => path.endsWith('/people')).length, 0);
    const html = await getPage('?celebrations');
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /id="vmsp-week"/);
    assert.match(html, /vmsp-events-ready/);
    assert.doesNotMatch(html, /test-only-secret|\/api\/chmeetings/);
    const feed = JSON.parse(html.match(/<script id="vmsp-feed-data" type="application\/json">([^<]*)<\/script>/)?.[1] || 'null');
    assert.equal(feed.events[0].title, 'Test Event');
    assert.equal(feed.celebrations.length, 2);
    const firstCount = calls.length;
    assert.ok(firstCount > 1);

    now += 4 * 60_000;
    await getPage('?celebrations');
    assert.equal(calls.length, firstCount);
    now += 60_001;
    await getPage('?celebrations');
    assert.ok(calls.length > firstCount);

    const head = await nativeFetch(`${base}/events`, { method: 'HEAD' });
    assert.equal(head.status, 204);
    assert.equal(head.headers.get('access-control-allow-origin'), '*');
    assert.equal((await nativeFetch(`${base}/api/chmeetings/events`)).status, 404);
    assert.equal((await nativeFetch(`${base}/api/chmeetings/celebrations`)).status, 404);
  } finally {
    server.close();
    globalThis.fetch = nativeFetch;
    Date.now = priorNow;
    if (priorKey === undefined) delete process.env.CHMEETINGS_API_KEY;
    else process.env.CHMEETINGS_API_KEY = priorKey;
  }
});
