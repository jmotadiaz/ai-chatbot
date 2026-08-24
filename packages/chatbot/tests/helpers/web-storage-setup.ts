/**
 * Web Storage polyfill for jsdom test files.
 *
 * Node 26 ships an experimental `localStorage`/`sessionStorage` global that
 * stays `undefined` unless the process is started with `--localstorage-file`.
 * Vitest's jsdom environment copies jsdom's window keys onto `globalThis`, but
 * `getWindowKeys` drops every key that already exists there — so jsdom's own
 * Storage implementation is never installed and `window.localStorage` reads as
 * `undefined` instead of a Storage object.
 *
 * This setup file restores the expected behaviour with an in-memory Storage.
 * It runs per test file (fresh store, no cross-file leakage, unlike a shared
 * `--localstorage-file`) and is a no-op under the `node` environment and on
 * runtimes where the real thing is present.
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  clear(): void {
    this.store.clear();
  }
}

function installStorage(name: "localStorage" | "sessionStorage"): void {
  if ((globalThis as Record<string, unknown>)[name]) return;
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

if (typeof window !== "undefined") {
  installStorage("localStorage");
  installStorage("sessionStorage");
}
