import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createFakeSupabase, resetStore, ageClaim } from './helpers/fakeSupabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RATE_LIMIT_SALT = 'test-salt';
process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key'; // not actually called by these tests

const state = { store: createStore() };
mock.module('@supabase/supabase-js', {
  namedExports: { createClient: () => createFakeSupabase(state.store) },
});

const { hashToken } = await import('../api/_db.js');
const handler = (await import('../api/shared.js')).default;

beforeEach(() => {
  resetStore(state.store);
  seedWorld('ABCDEF', [
    { id: 'p1', name: 'Alice', color: '#f5b85a', token: 'tok-alice' },
    { id: 'p2', name: 'Bob', color: '#8ec5ff', token: 'tok-bob' },
  ]);
  seedWorld('ZZZZZZ', [{ id: 'p3', name: 'Eve', color: '#9be3b5', token: 'tok-eve' }]);
});

function seedWorld(code, players) {
  state.store.tables.worlds.push({
    code,
    premise: 'a test world',
    bible: { title: 'Test', tagline: '', mood: 'weightless', places: [{ name: 'A place', description: '' }], cast: [{ name: 'Someone' }], threads: [], opening: {} },
    base: {},
    created_at: new Date().toISOString(),
  });
  for (const p of players) {
    state.store.tables.players.push({
      id: p.id,
      world_code: code,
      name: p.name,
      color: p.color,
      token_hash: hashToken(p.token),
      created_at: new Date().toISOString(),
    });
  }
}

function fakeRes() {
  const res = { statusCode: 200 };
  res.setHeader = () => {};
  res.end = (body) => { res.body = body; };
  return res;
}

async function call(body) {
  const req = { method: 'POST', headers: {}, body };
  const res = fakeRes();
  await handler(req, res);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
}

test('two players claiming the same art kind: only one gets it, the other waits', async () => {
  const first = await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'place0' });
  assert.equal(first.status, 200);
  assert.equal(first.json.claimed, true);

  const second = await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p2', token: 'tok-bob', kind: 'place0' });
  assert.equal(second.status, 200);
  assert.equal(second.json.wait, true);
});

test('a stale claim can be reclaimed by someone else', async () => {
  await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'place0' });
  ageClaim(state.store, 'ABCDEF', 'place0', 200); // older than the 3-minute staleness window

  const reclaim = await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p2', token: 'tok-bob', kind: 'place0' });
  assert.equal(reclaim.json.claimed, true);
});

test('once a claimed picture is uploaded, claimArt reports it ready instead of re-claiming it', async () => {
  await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'portrait0' });
  const upload = await call({ action: 'putArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'portrait0', mime: 'image/jpeg', data: Buffer.from('fake-jpeg-bytes').toString('base64') });
  assert.equal(upload.status, 200);
  assert.equal(upload.json.ok, true);

  const second = await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p2', token: 'tok-bob', kind: 'portrait0' });
  assert.equal(second.json.ready, true);
  assert.ok(second.json.url);
});

test('art never returns another world\'s pictures', async () => {
  await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'portrait0' });
  await call({ action: 'putArt', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice', kind: 'portrait0', mime: 'image/jpeg', data: Buffer.from('fake-jpeg-bytes').toString('base64') });

  const abcdefArt = await call({ action: 'art', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice' });
  assert.ok(abcdefArt.json.art.portrait0?.url);

  const otherWorldArt = await call({ action: 'art', code: 'ZZZZZZ', playerId: 'p3', token: 'tok-eve' });
  assert.deepEqual(otherWorldArt.json.art, {});
});

test('a wrong device token can\'t list, claim or upload art', async () => {
  const list = await call({ action: 'art', code: 'ABCDEF', playerId: 'p1', token: 'not-the-real-token' });
  assert.equal(list.status, 403);

  const claim = await call({ action: 'claimArt', code: 'ABCDEF', playerId: 'p1', token: 'not-the-real-token', kind: 'place0' });
  assert.equal(claim.status, 403);

  const put = await call({ action: 'putArt', code: 'ABCDEF', playerId: 'p1', token: 'not-the-real-token', kind: 'place0', mime: 'image/jpeg', data: 'AA==' });
  assert.equal(put.status, 403);

  // sanity check: the data was never written under the wrong token
  const stillEmpty = await call({ action: 'art', code: 'ABCDEF', playerId: 'p1', token: 'tok-alice' });
  assert.deepEqual(stillEmpty.json.art, {});
});
