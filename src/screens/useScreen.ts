import { useRoute } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { store } from "../data/store";
import { ctxOf, type QueryCtx } from "../queries/common";
import { useScreenReady } from "./useScreenReady";

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

export type ScreenState<T> = { data?: T; error?: Error; loading: boolean; reload: () => void };

export function useScreen<T>(query: (ctx: QueryCtx) => Promise<T>, key: unknown[]): ScreenState<T> {
  const route = useRoute();
  const mounted = useRef(0);
  useLayoutEffect(() => {
    mounted.current = performance.now();
  }, []);
  const ready = useScreenReady();
  const v = useDataVersion(ready);
  const [tick, setTick] = useState(0);
  const sig = `${JSON.stringify(key)}|${v}|${tick}`;
  const [state, setState] = useState<{ sig?: string; data?: T; error?: Error }>({});
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ready || state.sig === sig) return;
    let live = true;
    const started = performance.now();
    let contextMs = 0;
    ctxOf(store)
      .then((ctx) => {
        contextMs = performance.now() - started;
        return live ? query(ctx) : undefined;
      })
      .then(
        (data) => {
          if (!live) return;
          if (__DEV__) {
            const finished = performance.now();
            console.info(`[screen] ${route.name} ready ctx-ms=${Math.round(contextMs)} query-ms=${Math.round(finished - started - contextMs)} load-ms=${Math.round(finished - started)} mounted-ms=${Math.round(finished - mounted.current)}`);
          }
          setState({ sig, data });
        },
        (e: unknown) => live && setState((s) => ({ ...s, sig, error: e instanceof Error ? e : new Error(String(e)) })),
      );
    return () => {
      live = false;
    };
    // Inline queries change identity each render; their dependencies are encoded in sig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready]);

  return { data: state.data, error: state.error, loading: state.sig !== sig, reload };
}
