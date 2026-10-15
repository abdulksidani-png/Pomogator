'use client';
/** A tiny IndexedDB key-value store for things too big for localStorage (document pages, a photo background). */

const DB = 'studybuddy'; // the app's first name, kept so saved documents aren't lost
const STORE = 'kv';
let dbP: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbP;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key)).catch(() => undefined),
  del: (key: string) => run<void>('readwrite', (s) => s.delete(key)).catch(() => undefined),
  /** Delete every key that starts with `prefix`. */
  async clearPrefix(prefix: string) {
    try {
      const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      await Promise.all(keys.filter((k) => String(k).startsWith(prefix)).map((k) => run<void>('readwrite', (s) => s.delete(k))));
    } catch { /* IndexedDB unavailable */ }
  },
};
