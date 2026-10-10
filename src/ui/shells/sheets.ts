import { useSyncExternalStore } from "react";

// Task sheets (check-in, log) open over the screen you are on, from any button on it (spec §11 UX2). On the web that
// is a search param (`?checkin=1`) so Back closes the sheet. On a phone the sheet is a bottom sheet the screen
// renders itself, and this store says which are open: `openSheet("checkin")` from a trigger, and
// `useSheetOpen("checkin")` in the screen that owns the sheet. The OS back gesture dismisses the sheet (it is modal).

const open = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSheet(key: string) {
  if (open.has(key)) return;
  open.add(key);
  emit();
}

export function closeSheet(key: string) {
  if (open.delete(key)) emit();
}

export function useSheetOpen(key: string) {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => open.has(key),
    () => false,
  );
}
