/**
 * lib/apiClient.ts
 *
 * A drop-in Supabase-compatible API client backed by the local Express/PostgreSQL API.
 * Exported as `apiClient`; re-exported as `supabase` from lib/supabase.ts so every
 * existing import keeps working without modification.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Config ──────────────────────────────────────────────────────────────────
export const API_BASE: string =
  // Expo inlines this at build time. Must be a direct `process.env.EXPO_PUBLIC_*`
  // member access (no cast/guard) for the babel-preset-expo env plugin to replace it.
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

const TOKEN_KEY   = 'lab_access_token';
const REFRESH_KEY = 'lab_refresh_token';
const SESSION_KEY = 'lab_session';
const isWeb       = Platform.OS === 'web';

// ─── Storage helpers (web = localStorage, native = AsyncStorage) ─────────────
async function _get(key: string): Promise<string | null> {
  if (isWeb) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return AsyncStorage.getItem(key);
}
async function _set(key: string, val: string | null): Promise<void> {
  if (isWeb) {
    try { val !== null ? localStorage.setItem(key, val) : localStorage.removeItem(key); } catch {}
    return;
  }
  val !== null ? await AsyncStorage.setItem(key, val) : await AsyncStorage.removeItem(key);
}

// ─── Session shape ────────────────────────────────────────────────────────────
type SessionUser = { id: string; email: string; role: string; full_name?: string };
type Session     = { access_token: string; refresh_token: string; user: SessionUser };

let _session: Session | null = null;

// ─── Auth state listeners (replaces supabase.auth.onAuthStateChange) ─────────
type AuthListener = (event: string, session: Session | null) => void;
const _listeners  = new Set<AuthListener>();

function _emit(event: string, session: Session | null) {
  _listeners.forEach((fn) => { try { fn(event, session); } catch {} });
}

// ─── Token refresh (singleton promise so parallel calls don't double-refresh) ─
let _refreshPromise: Promise<string | null> | null = null;

async function _doRefresh(): Promise<string | null> {
  const rt = await _get(REFRESH_KEY);
  if (!rt) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) { await _clearSession(); _emit('SIGNED_OUT', null); return null; }
    const data = await res.json();
    await _set(TOKEN_KEY,   data.access_token);
    await _set(REFRESH_KEY, data.refresh_token);
    if (_session) {
      _session.access_token  = data.access_token;
      _session.refresh_token = data.refresh_token;
    }
    return data.access_token;
  } catch {
    return null;
  }
}

async function _clearSession() {
  _session = null;
  await _set(TOKEN_KEY,   null);
  await _set(REFRESH_KEY, null);
  await _set(SESSION_KEY, null);
}

// ─── Central fetch with auto-refresh ─────────────────────────────────────────
async function _fetch(
  path: string,
  opts: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token   = await _get(TOKEN_KEY);
  const headers = new Headers((opts.headers as HeadersInit) || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && !retried) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.code === 'TOKEN_EXPIRED') {
      if (!_refreshPromise) _refreshPromise = _doRefresh();
      const newToken = await _refreshPromise;
      _refreshPromise = null;
      if (newToken) return _fetch(path, opts, true);
    }
  }
  return res;
}

// ─── QueryBuilder ─────────────────────────────────────────────────────────────
type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

class QueryBuilder {
  private _table:       string;
  private _op:          Op     = 'select';
  private _cols:        string = '*';
  private _filters:     Record<string, unknown> = {};
  private _orderCol?:   string;
  private _orderAsc     = true;
  private _limitN?:     number;
  private _single       = false;
  private _maybeSingle  = false;
  private _payload?:    unknown;
  private _upsertOpts?: { onConflict?: string };

  constructor(table: string) { this._table = table; }

  // ── Builder API (mirrors Supabase's chaining style) ──

  select(cols = '*') {
    if (this._op === 'insert' || this._op === 'upsert' || this._op === 'update') {
      this._cols = cols; // "return selected columns" after mutation
      return this;
    }
    this._op   = 'select';
    this._cols = cols;
    return this;
  }

  eq(col: string, val: unknown) {
    this._filters[col] = val;
    return this;
  }

  order(col: string, opts: { ascending?: boolean } = {}) {
    this._orderCol = col;
    this._orderAsc = opts.ascending !== false;
    return this;
  }

  limit(n: number) { this._limitN = n; return this; }
  single()         { this._single = true; return this; }
  maybeSingle()    { this._maybeSingle = true; return this; }

  insert(data: unknown) {
    this._op      = 'insert';
    this._payload = data;
    return this;
  }

  upsert(data: unknown, opts?: { onConflict?: string }) {
    this._op         = 'upsert';
    this._payload    = data;
    this._upsertOpts = opts;
    return this;
  }

  update(data: unknown) {
    this._op      = 'update';
    this._payload = data;
    return this;
  }

  delete() { this._op = 'delete'; return this; }

  // ── Make the builder thenable (allows `await supabase.from(…).select(…)`) ──
  then(
    onFulfilled?: ((v: { data: any; error: any }) => any) | null,
    onRejected?:  ((e: any) => any) | null,
  ) { return this._run().then(onFulfilled, onRejected); }

  catch(onRejected?: ((e: any) => any) | null) { return this._run().catch(onRejected); }

  // ─────────────────────────────────────────────────────────────────────────
  private async _run(): Promise<{ data: any; error: any }> {
    try {
      const base = _tableToPath(this._table);

      // ── SELECT ──────────────────────────────────────────────────────────
      if (this._op === 'select') {
        const params = new URLSearchParams();

        // Detect Supabase join syntax:  "*, instruments(name)"
        if (this._cols.includes('(')) params.set('include_instrument', 'true');

        // Filters
        for (const [k, v] of Object.entries(this._filters)) params.set(k, String(v));

        if (this._orderCol) {
          params.set('order_by',  this._orderCol);
          params.set('order_dir', this._orderAsc ? 'asc' : 'desc');
        }
        if (this._limitN != null) params.set('limit', String(this._limitN));

        // Single item by id → use /:id endpoint
        if (this._filters['id'] != null && (this._single || this._maybeSingle)) {
          const res = await _fetch(`${base}/${this._filters['id']}`);
          if (res.status === 404) {
            return this._maybeSingle
              ? { data: null,  error: null }
              : { data: null,  error: { message: 'Not found' } };
          }
          if (!res.ok) return { data: null, error: await _errJson(res) };
          return { data: await res.json(), error: null };
        }

        const qs  = params.toString();
        const res = await _fetch(`${base}${qs ? `?${qs}` : ''}`);
        if (!res.ok) return { data: null, error: await _errJson(res) };

        const rows = await res.json();
        const arr  = Array.isArray(rows) ? rows : [];

        if (this._single || this._maybeSingle) return { data: arr[0] ?? null, error: null };
        return { data: arr, error: null };
      }

      // ── INSERT ───────────────────────────────────────────────────────────
      if (this._op === 'insert') {
        const res  = await _fetch(base, { method: 'POST', body: JSON.stringify(this._payload) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: _normErr(json, res) };
        return { data: json, error: null };
      }

      // ── UPSERT ───────────────────────────────────────────────────────────
      if (this._op === 'upsert') {
        const qs  = this._upsertOpts?.onConflict ? `?onConflict=${this._upsertOpts.onConflict}` : '';
        const res  = await _fetch(`${base}${qs}`, { method: 'POST', body: JSON.stringify(this._payload) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: _normErr(json, res) };
        return { data: json, error: null };
      }

      // ── UPDATE ───────────────────────────────────────────────────────────
      if (this._op === 'update') {
        const filterEntries = Object.entries(this._filters);
        if (filterEntries.length === 0) return { data: null, error: { message: 'update() requires at least one eq() filter' } };

        // Encode the filter value into the path — works for both id and email
        const [, filterVal] = filterEntries[0];
        const res  = await _fetch(
          `${base}/${encodeURIComponent(String(filterVal))}`,
          { method: 'PUT', body: JSON.stringify(this._payload) },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: _normErr(json, res) };
        return { data: json, error: null };
      }

      // ── DELETE ───────────────────────────────────────────────────────────
      if (this._op === 'delete') {
        const filterEntries = Object.entries(this._filters);
        if (filterEntries.length === 0) return { data: null, error: { message: 'delete() requires at least one eq() filter' } };

        const [, filterVal] = filterEntries[0];
        const res = await _fetch(
          `${base}/${encodeURIComponent(String(filterVal))}`,
          { method: 'DELETE' },
        );
        if (res.status === 204 || res.ok) return { data: null, error: null };
        return { data: null, error: await _errJson(res) };
      }

      return { data: null, error: { message: 'Unknown operation' } };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Network error' } };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _tableToPath(table: string): string {
  const MAP: Record<string, string> = {
    instruments:           '/api/instruments',
    maintenance_logs:      '/api/maintenance-logs',
    profiles:              '/api/profiles',
    documents:             '/api/documents',
    notification_settings: '/api/notification-settings',
    notifications_log:     '/api/notifications-log',
  };
  return MAP[table] ?? `/api/${table.replace(/_/g, '-')}`;
}

async function _errJson(res: Response): Promise<{ message: string }> {
  const j = await res.json().catch(() => ({}));
  return j.error ? { message: String(j.error) } : { message: res.statusText || String(res.status) };
}

function _normErr(json: any, res: Response): { message: string } {
  if (json?.error) return { message: String(json.error) };
  return { message: res.statusText || String(res.status) };
}

// ─── Storage ─────────────────────────────────────────────────────────────────
class StorageBucket {
  constructor(private bucket: string) {}

  /** Upload a file to the local API storage */
  async upload(
    filePath: string,
    data: File | ArrayBuffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ error: any }> {
    try {
      const formData = new FormData();
      formData.append('path', filePath);

      if (typeof File !== 'undefined' && data instanceof File) {
        formData.append('file', data);
      } else {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
        const blob  = new Blob([bytes], { type: options?.contentType ?? 'application/octet-stream' });
        formData.append('file', blob, filePath.split('/').pop() ?? 'upload');
      }

      const token   = await _get(TOKEN_KEY);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/storage/upload/${this.bucket}`, {
        method: 'POST',
        headers,
        body:   formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        return { error: err };
      }
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message } };
    }
  }

  /** Delete one or more files from the bucket (mirrors Supabase storage.remove) */
  async remove(paths: string[]): Promise<{ error: any }> {
    try {
      for (const p of paths) {
        await _fetch(`/api/storage/files/${this.bucket}/${p}`, { method: 'DELETE' });
      }
      return { error: null };
    } catch (err: any) {
      return { error: { message: err?.message } };
    }
  }

  /**
   * Returns a public URL for a stored file.
   * NOTE: Supabase's getPublicUrl() is synchronous — ours is too.
   */
  getPublicUrl(filePath: string): { data: { publicUrl: string } } {
    return {
      data: { publicUrl: `${API_BASE}/api/storage/files/${this.bucket}/${filePath}` },
    };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const _auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error || 'Login failed' } };

      const sess: Session = { access_token: json.access_token, refresh_token: json.refresh_token, user: json.user };
      _session = sess;
      await _set(TOKEN_KEY,   json.access_token);
      await _set(REFRESH_KEY, json.refresh_token);
      await _set(SESSION_KEY, JSON.stringify(sess));
      _emit('SIGNED_IN', sess);
      return { data: { user: json.user, session: sess }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message } };
    }
  },

  async signUp({ email, password }: { email: string; password: string }) {
    try {
      const res  = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error || 'Signup failed' } };

      const sess: Session = { access_token: json.access_token, refresh_token: json.refresh_token, user: json.user };
      _session = sess;
      await _set(TOKEN_KEY,   json.access_token);
      await _set(REFRESH_KEY, json.refresh_token);
      await _set(SESSION_KEY, JSON.stringify(sess));
      _emit('SIGNED_IN', sess);
      return { data: { user: json.user, session: sess }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message } };
    }
  },

  async signOut() {
    try {
      const rt = await _get(REFRESH_KEY);
      await _fetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: rt }) });
    } catch {}
    await _clearSession();
    _emit('SIGNED_OUT', null);
    return { error: null };
  },

  async getSession(): Promise<{ data: { session: Session | null }; error: any }> {
    if (_session) return { data: { session: _session }, error: null };

    try {
      const stored = await _get(SESSION_KEY);
      if (!stored) return { data: { session: null }, error: null };

      const sess = JSON.parse(stored) as Session;

      // Verify token is still valid
      const res = await _fetch('/api/auth/me');
      if (!res.ok) {
        // Try refreshing before giving up
        const newToken = await _doRefresh();
        if (!newToken) { await _clearSession(); return { data: { session: null }, error: null }; }
      } else {
        const { user } = await res.json();
        sess.user = user;
      }

      _session = sess;
      return { data: { session: sess }, error: null };
    } catch {
      await _clearSession();
      return { data: { session: null }, error: null };
    }
  },

  onAuthStateChange(callback: AuthListener) {
    _listeners.add(callback);
    return {
      data: { subscription: { unsubscribe: () => { _listeners.delete(callback); } } },
    };
  },
};

// ─── Functions ────────────────────────────────────────────────────────────────
const _functions = {
  async invoke(
    fnName: string,
    options?: { body?: Record<string, unknown> },
  ): Promise<{ data: any; error: any }> {
    try {
      const res  = await _fetch(`/api/functions/${fnName}`, {
        method: 'POST',
        body:   JSON.stringify(options?.body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: _normErr(json, res) };
      return { data: json, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message } };
    }
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────
export const apiClient = {
  /** Query builder — mirrors supabase.from(table) */
  from: (table: string) => new QueryBuilder(table),
  auth:      _auth,
  functions: _functions,
  storage:   { from: (bucket: string) => new StorageBucket(bucket) },
};
