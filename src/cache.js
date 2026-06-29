/**
 * Simple in-memory LRU-style TTL cache.
 * Used to avoid hitting the Companies House 600 req / 5-min rate limit.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;

export class Cache {
  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES) {
    this._ttl = ttlMs;
    this._max = maxEntries;
    this._store = new Map();
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    // Move to end (most-recently-used)
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this._store.has(key)) this._store.delete(key);
    if (this._store.size >= this._max) {
      // Evict oldest entry
      this._store.delete(this._store.keys().next().value);
    }
    this._store.set(key, { value, expiresAt: Date.now() + this._ttl });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  get size() {
    return this._store.size;
  }
}

export const cache = new Cache();
