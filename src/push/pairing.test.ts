import { describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    multiSet: async (kv: [string, string][]) => kv.forEach(([k, v]) => storage.set(k, v)),
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
  },
}));
const secure = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
  deleteItemAsync: async (k: string) => void secure.delete(k),
}));

const { clearPairing, parsePairing, readPairing, readSecret, readState, savePairing, serverHost, writeState } = await import("./pairing");

const URL_OK = "https://pulse.example.com/api/ingest/health-connect/abcdefghijklmnopqrstuv";

describe("parsePairing", () => {
  it("reads the pairing link Pulse shows (the companion app's format)", () => {
    const link = `https://owen282000.github.io/life-dashboard-companion-app/pair#v=1&url=${encodeURIComponent(URL_OK)}&secret=s3cr3t-value&name=${encodeURIComponent("Pulse de Anthony")}&sources=health_connect`;
    const r = parsePairing(link);
    expect(r).toEqual({ ok: true, pairing: { url: URL_OK, secret: "s3cr3t-value", name: "Pulse de Anthony" } });
  });
  it("reads a URL and a secret on two lines", () => {
    expect(parsePairing(`${URL_OK}\nmy-secret`)).toEqual({ ok: true, pairing: { url: URL_OK, secret: "my-secret", name: "Pulse" } });
  });
  it("refuses what isn't a Pulse ingest URL, plain http unless allowed, and missing parts", () => {
    expect(parsePairing("")).toEqual({ ok: false, error: "empty" });
    expect(parsePairing("https://pulse.example.com/ secret")).toEqual({ ok: false, error: "not_pulse" });
    expect(parsePairing(`http://pulse.lan/api/ingest/health-connect/abcdefghijklmnopqrstuv secret`)).toEqual({ ok: false, error: "http" });
    expect(parsePairing(`http://pulse.lan/api/ingest/health-connect/abcdefghijklmnopqrstuv secret`, { allowHttp: true }).ok).toBe(true);
    expect(parsePairing(URL_OK)).toEqual({ ok: false, error: "no_secret" });
    expect(parsePairing("secret only")).toEqual({ ok: false, error: "no_url" });
  });
  it("names the server", () => expect(serverHost(URL_OK)).toBe("pulse.example.com"));
});

describe("stored pairing", () => {
  it("keeps the secret in secure storage and the rest beside it; clearing removes both", async () => {
    expect(await readPairing()).toBeNull();
    const p = await savePairing({ url: URL_OK, secret: "zz-top-secret", name: "Pulse" }, 1_700_000_000);
    expect(p).toEqual({ url: URL_OK, name: "Pulse", pairedAt: 1_700_000_000 });
    expect(await readPairing()).toEqual(p);
    expect(await readSecret()).toBe("zz-top-secret");
    expect(storage.get("pulse.push.pairing")).not.toContain("zz-top-secret");
    expect((await readState()).lastSequence).toBe(0);
    await writeState({ lastSequence: 3, lastDay: "2026-10-01" });
    expect(await readState()).toMatchObject({ lastSequence: 3, lastDay: "2026-10-01", enabled: true });
    await clearPairing();
    expect(await readPairing()).toBeNull();
    expect(await readSecret()).toBeNull();
    expect((await readState()).lastSequence).toBe(0);
  });
});
