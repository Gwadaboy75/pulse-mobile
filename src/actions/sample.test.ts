import { describe, expect, it, vi } from "vitest";
import { clearAllTables } from "../data/repos";
import { testDb } from "../data/testing";
import { DEFAULT_JOURNAL_TAGS } from "../journalTags";
import { saveProfile } from "../profile";
import { leaveSample } from "./sample";

vi.mock("../screens/useScreen", () => ({ dataChanged: vi.fn() }));

describe("leaveSample", () => {
  it("empties every table but keeps the new Google grant and the theme", async () => {
    const t = testDb();
    const grant = { scope: "s", revokedAt: null, updatedAt: 1 };
    await saveProfile(t.store, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: "Asia/Kolkata" });
    await t.store.journal.ensureDefaultTags([...DEFAULT_JOURNAL_TAGS]);
    await t.store.settings.set("sample", true);
    await t.store.settings.set("google.grant", grant);
    await t.store.settings.set("theme", "dark");

    expect(await leaveSample(t.store, () => clearAllTables(t.db))).toEqual({ ok: true, data: undefined });
    expect(await t.store.profile.getProfileRow()).toBeNull();
    expect(await t.store.journal.tags()).toEqual([]);
    expect(await t.store.settings.get("sample")).toBeNull();
    expect(await t.store.settings.get("google.grant")).toEqual(grant);
    expect(await t.store.settings.get("theme")).toBe("dark");
  });

  it("a failure rolls back: the sample stays", async () => {
    const t = testDb();
    await t.store.settings.set("sample", true);
    const r = await leaveSample(t.store, () => {
      clearAllTables(t.db);
      throw new Error("disk full");
    });
    expect(r.ok).toBe(false);
    expect(await t.store.settings.get("sample")).toBe(true);
  });
});
