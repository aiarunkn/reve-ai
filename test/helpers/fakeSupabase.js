/**
 * A minimal in-memory fake of the slice of @supabase/supabase-js used by api/_db.js,
 * api/_auth.js, api/_limits.js and api/_art.js — just enough to exercise the real
 * application code with `mock.module('@supabase/supabase-js', ...)`, with no network.
 */
import { randomUUID } from 'node:crypto';

const PRIMARY_KEY = { worlds: 'code' };

export function createStore() {
  return {
    tables: { worlds: [], players: [], turns: [], usage: [], world_art: [] },
    users: {}, // token -> { id, email }
    storage: {}, // "bucket/path" -> { bytes, contentType }
    turnSeq: 1,
  };
}

/**
 * Clears a store IN PLACE (same object identity). Use this between tests instead of creating a
 * new store object: the fake Supabase client is created once (api/_db.js caches it per module
 * load), so its closures hold a reference to the original store object forever.
 */
export function resetStore(store) {
  Object.assign(store, createStore());
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

class Query {
  constructor(store, table, op, payload) {
    this.store = store;
    this.table = table;
    this.op = op;
    this.payload = payload;
    this.filters = [];
    this.opts = {};
  }
  eq(col, val) {
    this.filters.push([col, val]);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this.opts.orderBy = { col, ascending };
    return this;
  }
  limit(n) {
    this.opts.limit = n;
    return this;
  }
  select() {
    return this;
  }
  single() {
    this.opts.mode = 'single';
    return this._run();
  }
  maybeSingle() {
    this.opts.mode = 'maybeSingle';
    return this._run();
  }
  then(onFulfilled, onRejected) {
    return this._run().then(onFulfilled, onRejected);
  }
  async _run() {
    const rows = (this.store.tables[this.table] ??= []);
    try {
      if (this.op === 'select') {
        let result = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v));
        if (this.opts.orderBy) {
          const { col, ascending } = this.opts.orderBy;
          result = [...result].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (ascending ? 1 : -1));
        }
        if (this.opts.limit) result = result.slice(0, this.opts.limit);
        return this._shape(result);
      }
      if (this.op === 'insert') {
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(clone);
        const pk = PRIMARY_KEY[this.table];
        if (pk && list.some((row) => rows.some((r) => r[pk] === row[pk]))) {
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${this.table}.${pk}` } };
        }
        const inserted = list.map((row) => {
          const full = {
            ...(this.table === 'players' ? { id: randomUUID() } : {}),
            ...(this.table === 'turns' ? { id: this.store.turnSeq++ } : {}),
            created_at: new Date().toISOString(),
            ...row,
          };
          rows.push(full);
          return full;
        });
        return this._shape(inserted);
      }
      if (this.op === 'update') {
        const matched = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v));
        matched.forEach((r) => Object.assign(r, this.payload));
        return this._shape(matched);
      }
      return { data: null, error: { message: `Unsupported op ${this.op}` } };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }
  _shape(rows) {
    if (this.opts.mode === 'single') return rows.length === 1 ? { data: clone(rows[0]), error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
    if (this.opts.mode === 'maybeSingle') return { data: rows[0] ? clone(rows[0]) : null, error: null };
    return { data: rows.map(clone), error: null };
  }
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Mirrors the bump_usage() Postgres function (see supabase/migrations/..._auth_usage_art.sql). */
function fakeBumpUsage(store, { p_subject, p_kind, p_limit }) {
  if (p_limit <= 0) return { data: -1, error: null };
  const rows = (store.tables.usage ??= []);
  const day = dayKey();
  let row = rows.find((r) => r.subject === p_subject && r.day === day && r.kind === p_kind);
  if (!row) {
    rows.push({ subject: p_subject, day, kind: p_kind, count: 1 });
    return { data: 1, error: null };
  }
  if (row.count >= p_limit) return { data: -1, error: null };
  row.count += 1;
  return { data: row.count, error: null };
}

/** Mirrors the claim_art() Postgres function (see supabase/migrations/20261121120100_claim_art.sql). */
function fakeClaimArt(store, { p_world_code, p_kind, p_claimed_by, p_stale_seconds = 180 }) {
  const rows = (store.tables.world_art ??= []);
  const row = rows.find((r) => r.world_code === p_world_code && r.kind === p_kind);
  if (!row) {
    rows.push({ world_code: p_world_code, kind: p_kind, status: 'painting', claimed_by: p_claimed_by, path: null, mime: null, updated_at: new Date().toISOString() });
    return { data: [{ status: 'claimed', path: null, mime: null }], error: null };
  }
  if (row.status === 'ready') return { data: [{ status: 'ready', path: row.path, mime: row.mime }], error: null };
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (row.status === 'painting' && ageMs < p_stale_seconds * 1000) return { data: [{ status: 'wait', path: null, mime: null }], error: null };
  row.status = 'painting';
  row.claimed_by = p_claimed_by;
  row.path = null;
  row.mime = null;
  row.updated_at = new Date().toISOString();
  return { data: [{ status: 'claimed', path: null, mime: null }], error: null };
}

/** Lets a test backdate a world_art row's updated_at, to simulate a stale claim. */
export function ageClaim(store, worldCode, kind, seconds) {
  const row = store.tables.world_art.find((r) => r.world_code === worldCode && r.kind === kind);
  if (row) row.updated_at = new Date(Date.now() - seconds * 1000).toISOString();
}

export function createFakeSupabase(store) {
  return {
    auth: {
      async getUser(token) {
        const user = store.users[token];
        if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user: clone(user) }, error: null };
      },
    },
    async rpc(name, params) {
      if (name === 'bump_usage') return fakeBumpUsage(store, params);
      if (name === 'claim_art') return fakeClaimArt(store, params);
      return { data: null, error: { message: `Unknown rpc ${name}` } };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, opts) {
            store.storage[`${bucket}/${path}`] = { bytes, contentType: opts?.contentType };
            return { data: { path }, error: null };
          },
          async createSignedUrl(path, expiresIn) {
            const key = `${bucket}/${path}`;
            if (!store.storage[key]) return { data: null, error: { message: 'Object not found' } };
            return { data: { signedUrl: `https://fake.local/${key}?exp=${expiresIn}` }, error: null };
          },
        };
      },
    },
    from(table) {
      return {
        select: (cols) => new Query(store, table, 'select', null).select(cols),
        insert: (payload) => new Query(store, table, 'insert', payload),
        update: (payload) => new Query(store, table, 'update', payload),
      };
    },
  };
}
