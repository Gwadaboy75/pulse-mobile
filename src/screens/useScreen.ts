import { router, type Href } from "expo-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { store } from "../data/store";
import { ctxOf, type QueryCtx } from "../queries/common";
import { useScreenReady } from "../ui/shells/useScreenReady";

let version = 0;
const listeners = new Set<() => void>();

export function dataChanged() {
  version++;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const unsubscribe = () => {};
const inactiveSubscribe = () => unsubscribe;

export const useDataVersion = (active = true) => useSyncExternalStore(active ? subscribe : inactiveSubscribe, () => version);

/**
 * Screen results kept in memory, keyed by the screen's key (`[id, ...params]`). A screen opened again renders its last
 * result in the first frame, with no skeleton, and refreshes it in the background when the data changed (`dataChanged`)
 * or the result is older than FRESH_MS (clock-relative values like "today" and "11m ago").
 */
type Entry = { data: unknown; version: number; at: number };
const cache = new Map<string, Entry>();
const loading = new Map<string, Promise<void>>();
const cacheListeners = new Set<() => void>();
const FRESH_MS = 60_000;
// ponytail: a plain size cap, oldest first; a byte budget if results ever grow large.
const MAX_ENTRIES = 100;

const subscribeCache = (l: () => void) => {
  cacheListeners.add(l);
  return () => cacheListeners.delete(l);
};

const fresh = (e: Entry | undefined): e is Entry => !!e && e.version === version && Date.now() - e.at < FRESH_MS;

function load(k: string, query: (ctx: QueryCtx) => Promise<unknown>): Promise<void> {
  const running = loading.get(k);
  if (running) return running;
  const started = version;
  const at = performance.now();
  const p = ctxOf(store)
    .then(query)
    .then((data) => {
      if (__DEV__) console.info(`[screen] ${k} loaded ms=${Math.round(performance.now() - at)}`);
      cache.delete(k);
      cache.set(k, { data, version: started, at: Date.now() });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      for (const l of cacheListeners) l();
    })
    .finally(() => loading.delete(k));
  loading.set(k, p);
  return p;
}

const cacheKey = (key: readonly unknown[]) => JSON.stringify(key);

/** Loads a screen's result ahead of its navigation, so the screen opens with content. A fresh result is kept. */
export function prefetch<T>(query: (ctx: QueryCtx) => Promise<T>, key: ScreenKey): Promise<void> {
  const k = cacheKey(key);
  return fresh(cache.get(k)) ? Promise.resolve() : load(k, query);
}

/** A screen one tap away: its query and key, and its route when the whole page should render in the background too. */
export type Preload = { query: (ctx: QueryCtx) => Promise<unknown>; key: ScreenKey; href?: Href };

/**
 * Loads each item's data and then renders its route in the background (expo-router's prefetch: a pushed or tapped
 * route that is already rendered just slides in). One item per idle moment of the JS thread, so a tap or a scroll
 * never waits on them. Returns a cancel.
 */
export function preloadWhenIdle(items: Preload[]): () => void {
  let cancelled = false;
  let idle: number | undefined;
  const next = (i: number) => {
    if (cancelled || i >= items.length) return;
    idle = requestIdleCallback(() => {
      const { query, key, href } = items[i];
      prefetch(query, key)
        .then(() => !cancelled && href && router.prefetch(href))
        .catch(() => {})
        .finally(() => next(i + 1));
    });
  };
  next(0);
  return () => {
    cancelled = true;
    if (idle !== undefined) cancelIdleCallback(idle);
  };
}

/** A screen's id, then the parameters its query depends on. The id keeps two screens with the same parameters apart. */
export type ScreenKey = readonly [string, ...unknown[]];

export type ScreenState<T> = { data?: T; error?: Error; loading: boolean; reload: () => void };

export function useScreen<T>(query: (ctx: QueryCtx) => Promise<T>, key: ScreenKey): ScreenState<T> {
  const k = cacheKey(key);
  const ready = useScreenReady();
  const v = useDataVersion(ready);
  const entry = useSyncExternalStore(subscribeCache, () => cache.get(k));
  // A result in memory when the screen mounted shows at once; a cold one waits for the opening transition to end, so
  // the first render of the page does not land mid-slide. Once shown, results keep showing (a blurred screen too).
  const [settled, setSettled] = useState(() => cache.has(k));
  if (!settled && ready && entry) setSettled(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<{ k: string; error: Error }>();
  const reload = useCallback(() => {
    const e = cache.get(k);
    if (e) e.at = 0;
    setTick((t) => t + 1);
  }, [k]);

  useEffect(() => {
    if (fresh(cache.get(k))) return;
    let live = true;
    load(k, query).catch((e: unknown) => live && setError({ k, error: e instanceof Error ? e : new Error(String(e)) }));
    return () => {
      live = false;
    };
    // Inline queries change identity each render; their dependencies are in the key. `ready` re-checks on focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, v, ready, tick]);

  const shown = entry && settled ? (entry.data as T) : undefined;
  return { data: shown, error: error?.k === k ? error.error : undefined, loading: !fresh(entry), reload };
}
