import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function syncChanged() {
  version++;
  for (const listener of listeners) listener();
}

const inactiveSubscribe = () => () => {};
export const useSyncVersion = (active = true) => useSyncExternalStore(active ? subscribe : inactiveSubscribe, () => version);
