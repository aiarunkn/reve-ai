import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createFakeSupabase, resetStore } from './helpers/fakeSupabase.js';
import { resetFakeAnthropic, state as anthropicState } from './helpers/fakeAnthropic.js';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RATE_LIMIT_SALT = 'test-salt';
process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key';

const supaState = { store: createStore() };
mock.module('@supabase/supabase-js', {
  namedExports: { createClient: () => createFakeSupabase(supaState.store) },
});
mock.module('@anthropic-ai/sdk', {
  defaultExport: (await import('./helpers/fakeAnthropic.js')).default,
});

const handler = (await import('../api/story.js')).default;

function fakeRes() {
  const res = { statusCode: 200 };
  res.setHeader = () => {};
  res.end = (body) => { res.body = body; };
  return res;
}

async function call(body, headers = {}) {
  const req = { method: 'POST', headers, body };
  const res = fakeRes();
  await handler(req, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
}

test('a guest over the "world" limit never reaches Claude; a signed-in caller does', async () => {
  resetStore(supaState.store);
  resetFakeAnthropic({ title: 'A Test Story', tagline: '', setting: '', tone: '', mood: 'weightless', places: [], cast: [], threads: [], protagonist: {}, opening: {} });
  supaState.store.users['good-token'] = { id: 'user-1', email: 'alice@example.com' };
  process.env.RATE_LIMITS = JSON.stringify({ world: { guest: 1, signedIn: 5 } });
  process.env.GLOBAL_DAILY_CAPS = JSON.stringify({ world: 1000 });

  const begin = { action: 'begin', premise: 'a quiet place', players: [], photos: [] };

  const first = await call(begin); // guest, 1st call: allowed
  assert.equal(first.status, 200);
  assert.equal(anthropicState.calls, 1);

  const second = await call(begin); // guest, 2nd call: over the limit
  assert.equal(second.status, 429);
  assert.equal(second.json.signIn, true);
  assert.equal(second.json.kind, 'world');
  assert.equal(anthropicState.calls, 1, 'Claude must not be called once the limit is hit');

  const third = await call(begin, { authorization: 'Bearer good-token' }); // signed-in: a fresh quota
  assert.equal(third.status, 200);
  assert.equal(anthropicState.calls, 2);
});
