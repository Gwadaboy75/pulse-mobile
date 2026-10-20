// Pairing with the person's own Pulse server (docs/server.md): the webhook URL and the shared secret from the pairing
// code Pulse shows under Settings › Data source › Pair phone (the same code Life Dashboard Companion scans), and what
// the pushes remember between runs. The secret lives in expo-secure-store, as the coach's key does; the rest in
// AsyncStorage. Every change notifies `subscribe`rs so the Settings card refreshes.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export const PAIRING_KEY = "pulse.push.pairing";
export const STATE_KEY = "pulse.push.state";
const SECRET_KEY = "pulse.push.secret";

/** What Settings may show: the URL and the server's name, never the secret. */
export type Pairing = {
  /** The webhook URL, `https://<server>/api/ingest/health-connect/<id>`. */
  url: string;
  name: string;
  /** Unix seconds. */
  pairedAt: number;
};

export type PushState = {
  /** Push after every sync (and from the background task). */
  enabled: boolean;
  /** The last `sequence` sent; the server applies payloads in this order. */
  lastSequence: number;
  /** The last day (local) the pushes covered, so the next one starts a little before it. */
  lastDay: string | null;
  /** Unix seconds of the last accepted payload. */
  lastSentAt: number | null;
  /** The last failure, as a code the screen words (push.ts `PushError`), or null after a success. */
  lastError: string | null;
  /** Days the last push covered. */
  lastDays: number | null;
};

export const DEFAULT_STATE: PushState = { enabled: true, lastSequence: 0, lastDay: null, lastSentAt: null, lastError: null, lastDays: null };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The pairing page the code links to; its fragment holds the fields. */
const PAIR_HOST = /owen282000\.github\.io\/life-dashboard-companion-app\/pair/;
const INGEST_PATH = /\/api\/ingest\/health-connect\/[\w-]{16,64}$/;

export type ParsedPairing = { url: string; secret: string; name: string };

/**
 * Reads a pairing code: the link Pulse shows (`…/pair#v=1&url=…&secret=…&name=…`), or two lines / a space-separated
 * pair "url secret". Returns the problem as a code when it cannot: `empty`, `no_url`, `no_secret`, `bad_url`,
 * `not_pulse` (not a Pulse ingest URL), `http` (plain http: allowed only with `allowHttp`).
 */
export function parsePairing(text: string, opts: { allowHttp?: boolean } = {}): { ok: true; pairing: ParsedPairing } | { ok: false; error: string } {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "empty" };
  let url: string | null = null;
  let secret: string | null = null;
  let name = "Pulse";
  const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : null;
  if (hash && (PAIR_HOST.test(raw) || /(^|&)url=/.test(hash))) {
    const p = new URLSearchParams(hash);
    url = p.get("url");
    secret = p.get("secret");
    name = p.get("name") || name;
  } else {
    const parts = raw.split(/[\s\n]+/).filter(Boolean);
    url = parts.find((x) => /^https?:\/\//i.test(x)) ?? null;
    secret = parts.find((x) => x !== url && !/^https?:\/\//i.test(x)) ?? null;
  }
  if (!url) return { ok: false, error: "no_url" };
  if (!secret) return { ok: false, error: "no_secret" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "bad_url" };
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && opts.allowHttp)) return { ok: false, error: u.protocol === "http:" ? "http" : "bad_url" };
  if (!INGEST_PATH.test(u.pathname)) return { ok: false, error: "not_pulse" };
  return { ok: true, pairing: { url: u.toString(), secret: secret.trim(), name: name.trim() || "Pulse" } };
}

/** The server's origin, for the screen ("pulse.example.com"). */
export const serverHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export async function readPairing(): Promise<Pairing | null> {
  try {
    const raw = await AsyncStorage.getItem(PAIRING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pairing>;
    return typeof p.url === "string" && typeof p.pairedAt === "number" ? { url: p.url, name: typeof p.name === "string" ? p.name : "Pulse", pairedAt: p.pairedAt } : null;
  } catch {
    return null;
  }
}

/** The secret, or null (none, or the keystore can no longer read it: pair again). */
export const readSecret = (): Promise<string | null> => SecureStore.getItemAsync(SECRET_KEY).catch(() => null);

/** Saves a pairing (after the test ping worked) and starts the push state afresh. */
export async function savePairing(p: ParsedPairing, now = Math.floor(Date.now() / 1000)): Promise<Pairing> {
  await SecureStore.setItemAsync(SECRET_KEY, p.secret, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  const pairing: Pairing = { url: p.url, name: p.name, pairedAt: now };
  await AsyncStorage.multiSet([
    [PAIRING_KEY, JSON.stringify(pairing)],
    [STATE_KEY, JSON.stringify(DEFAULT_STATE)],
  ]);
  emit();
  return pairing;
}

/** Forgets the server. Nothing already sent is deleted there. */
export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => {});
  await AsyncStorage.multiRemove([PAIRING_KEY, STATE_KEY]).catch(() => {});
  emit();
}

export async function readState(): Promise<PushState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<PushState>) } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function writeState(patch: Partial<PushState>): Promise<PushState> {
  const next = { ...(await readState()), ...patch };
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next)).catch(() => {});
  emit();
  return next;
}
