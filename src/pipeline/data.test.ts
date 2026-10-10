// The two Hermes substitutions in data.ts: SHA-1 from @noble/hashes for node:crypto, and byteCompare for localeCompare.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadF2, loadF3, loadF4 } from "../testing/fixtures";
import { byteCompare, sha } from "./data";

describe("sha", () => {
  it("is node:crypto's SHA-1 hex, first 16 characters", () => {
    const inputs = ["", "abc", "Pulse Age", "ünïcödé ✓ 🫀", JSON.stringify([10, "Asia/Kolkata", 183, 58, ["seed-sleep-2026-04-06", 1775411400, 1775440020]]), "x".repeat(10_000)];
    for (const s of inputs) expect(sha(s)).toBe(createHash("sha1").update(s).digest("hex").slice(0, 16));
  });
});

describe("byteCompare", () => {
  it("orders by code point (UTF-8 bytes), not by UTF-16 unit or locale", () => {
    expect(byteCompare("a", "a")).toBe(0);
    expect(byteCompare("a", "ab")).toBeLessThan(0);
    expect(byteCompare("B", "a")).toBeLessThan(0); // localeCompare puts "a" first
    expect(byteCompare("\uffff", "\u{1fac0}")).toBeLessThan(0); // UTF-16 units would put the surrogate pair first
  });

  // pulse sorts with localeCompare (data.ts:115 session ids) and the database with "C" (session, exercise ids, tags).
  // Over every id that occurs in F2, F3 and F4, Node's localeCompare and byteCompare agree on every pair.
  it("orders every fixture id as Node's localeCompare does", () => {
    const f2 = loadF2();
    const f4 = loadF4();
    const ids = (rows: Record<string, unknown>[] | undefined, key: string) => (rows ?? []).map((r) => r[key] as string);
    const sets = {
      sessions: [...ids(f2.tables.sleep_sessions, "id"), ...ids(f4.seed.sleep_sessions, "id")],
      exercises: [...ids(f2.tables.exercises, "id"), ...ids(f4.seed.exercises, "id")],
      tags: [...ids(f2.tables.journal_entries, "tag"), ...ids(f4.seed.journal_entries, "tag"), ...ids(f2.tables.journal_tags, "tag")],
      days: [...ids(loadF3().daily_scores, "day"), ...ids(f4.daily_scores, "day")],
    };
    for (const [name, xs] of Object.entries(sets)) {
      const unique = [...new Set(xs)];
      expect(unique.length, name).toBeGreaterThan(0);
      const differ: string[] = [];
      for (const a of unique) for (const b of unique) if (Math.sign(byteCompare(a, b)) !== Math.sign(a.localeCompare(b))) differ.push(`${a} vs ${b}`);
      expect(differ, name).toEqual([]);
    }
  });
});
