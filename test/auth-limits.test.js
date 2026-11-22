import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createFakeSupabase, resetStore } from './helpers/fakeSupabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RATE_LIMIT_SALT = 'test-salt';

const state = { store: createStore() };
mock.module('@supabase/supabase-js', {
  namedExports: { createClient: () => createFakeSupabase(state.store) },
});

const { identify, guestKey } = await import('../api/_auth.js');
const { checkRateLimit } = await import('../api/_limits.js');

beforeEach(() => {
  resetStore(state.store);
});

function req({ token, ip = '203.0.113.5' } = {}) {
  return { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': ip }, socket: { remoteAddress: ip } };
}

test('a request with no bearer token is a guest', async () => {
  const id = await identify(req());
  assert.equal(id.isGuest, true);
  assert.equal(id.userId, null);
  assert.ok(id.subject.startsWith('guest:'));
});

test('an invalid or expired bearer token is treated as a guest, never as another user', async () => {
  state.store.users['good-token'] = { id: 'user-1', email: 'alice@example.com' };
  const asGuest = await identify(req({ token: 'bogus-or-expired-token' }));
  assert.equal(asGuest.isGuest, true);
  assert.equal(asGuest.userId, null);
  assert.notEqual(asGuest.userId, 'user-1');

  const asUser = await identify(req({ token: 'good-token' }));
  assert.equal(asUser.isGuest, false);
  assert.equal(asUser.userId, 'user-1');
  assert.equal(asUser.subject, 'user:user-1');
});

test('the guest key never embeds the raw IP and is stable per IP', () => {
  const a = guestKey(req({ ip: '203.0.113.5' }));
  const b = guestKey(req({ ip: '203.0.113.5' }));
  const c = guestKey(req({ ip: '198.51.100.9' }));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes('203.0.113.5'));
});

test('a guest over the limit gets 429 with signIn: true; under the limit gets through', async () => {
  process.env.RATE_LIMITS = JSON.stringify({ turn: { guest: 2, signedIn: 50 } });
  process.env.GLOBAL_DAILY_CAPS = JSON.stringify({ turn: 1000 });
  const guest = { isGuest: true, userId: null, subject: 'guest:aaa' };

  assert.equal((await checkRateLimit(guest, 'turn')).ok, true);
  assert.equal((await checkRateLimit(guest, 'turn')).ok, true);

  const third = await checkRateLimit(guest, 'turn');
  assert.equal(third.ok, false);
  assert.equal(third.status, 429);
  assert.equal(third.body.signIn, true);
  assert.equal(third.body.kind, 'turn');
  assert.equal(third.body.limit, 2);
});

test('a signed-in caller under the limit is never asked to sign in', async () => {
  process.env.RATE_LIMITS = JSON.stringify({ turn: { guest: 1, signedIn: 2 } });
  process.env.GLOBAL_DAILY_CAPS = JSON.stringify({ turn: 1000 });
  const user = { isGuest: false, userId: 'user-9', subject: 'user:user-9' };

  assert.equal((await checkRateLimit(user, 'turn')).ok, true);
  assert.equal((await checkRateLimit(user, 'turn')).ok, true);

  const third = await checkRateLimit(user, 'turn');
  assert.equal(third.ok, false);
  assert.equal(third.body.signIn, false); // already signed in: signing in again wouldn't help
});

test('the usage counter increments exactly once per allowed call', async () => {
  process.env.RATE_LIMITS = JSON.stringify({ image: { guest: 10, signedIn: 10 } });
  process.env.GLOBAL_DAILY_CAPS = JSON.stringify({ image: 1000 });
  const user = { isGuest: false, userId: 'user-5', subject: 'user:user-5' };

  for (let i = 1; i <= 3; i++) {
    await checkRateLimit(user, 'image');
    const row = state.store.tables.usage.find((r) => r.subject === user.subject && r.kind === 'image');
    assert.equal(row.count, i);
  }
});

test('a per-kind global cap trips across different callers', async () => {
  process.env.RATE_LIMITS = JSON.stringify({ recap: { guest: 100, signedIn: 100 } });
  process.env.GLOBAL_DAILY_CAPS = JSON.stringify({ recap: 1 });
  const alice = { isGuest: true, userId: null, subject: 'guest:alice' };
  const bob = { isGuest: true, userId: null, subject: 'guest:bob' };

  const first = await checkRateLimit(alice, 'recap');
  assert.equal(first.ok, true); // consumes the one global slot

  const second = await checkRateLimit(bob, 'recap'); // bob has never called this kind before
  assert.equal(second.ok, false);
  assert.equal(second.status, 429);
  assert.equal(second.body.signIn, false); // the whole feature is busy, not bob's own quota
});
