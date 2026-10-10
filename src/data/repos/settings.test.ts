// settings, sync state, dashboard, profile and coach.
import { beforeEach, describe, expect, it } from "vitest";
import { testDb, writesOf } from "../testing";
import { CHAT_PAGE } from "./coach";

let t: ReturnType<typeof testDb>;
beforeEach(() => {
  t = testDb();
});

describe("settings key-value", () => {
  it("stores JSON, reads it back parsed, null when unset, diff-only on repeat, removes", async () => {
    const { settings } = t.store;
    expect(await settings.get("theme")).toBeNull();
    await settings.set("theme", "dark");
    await settings.set("google.grant", { scope: "a b", revokedAt: null, updatedAt: 5 });
    await settings.set("notify.recovery", false);
    expect(await settings.get("theme")).toBe("dark");
    expect(await settings.get("google.grant")).toEqual({ scope: "a b", revokedAt: null, updatedAt: 5 });
    expect(await settings.get("notify.recovery")).toBe(false);
    expect(await writesOf(t.sqlite, async () => {
      await settings.set("theme", "dark");
      await settings.set("google.grant", { scope: "a b", revokedAt: null, updatedAt: 5 });
    })).toBe(0);
    await settings.set("theme", "light");
    expect(await settings.get("theme")).toBe("light");
    await settings.remove("theme");
    expect(await settings.get("theme")).toBeNull();
  });

  it("claimDay wins once a day: unset or earlier, never twice, never backwards", async () => {
    const { settings } = t.store;
    expect(await settings.claimDay("notify.lastRecoveryDay", "2026-10-02")).toBe(true);
    expect(await settings.claimDay("notify.lastRecoveryDay", "2026-10-02")).toBe(false);
    expect(await settings.claimDay("notify.lastRecoveryDay", "2026-10-01")).toBe(false);
    expect(await settings.get("notify.lastRecoveryDay")).toBe("2026-10-02");
    expect(await settings.claimDay("notify.lastRecoveryDay", "2026-10-03")).toBe(true);
    expect(await settings.claimDay("notify.lastSyncAlertDay", "2026-10-01")).toBe(true); // its own key
    expect(await settings.get("notify.lastRecoveryDay")).toBe("2026-10-03");
  });
});

describe("sync state", () => {
  it("upserts the given fields, leaves the others, diff-only", async () => {
    const { settings } = t.store;
    expect(await settings.getSyncState("steps")).toBeNull();
    await settings.setSyncState("steps", { lastAttemptAt: 10 });
    await settings.setSyncState("steps", { syncedThrough: 500, lastSuccessAt: 11, lastError: null });
    expect(await settings.getSyncState("steps")).toEqual({ type: "steps", syncedThrough: 500, backfillDaysDone: null, backfillDaysTotal: null, lastAttemptAt: 10, lastSuccessAt: 11, lastError: null });
    expect(await writesOf(t.sqlite, () => settings.setSyncState("steps", { syncedThrough: 500, lastAttemptAt: 10 }))).toBe(0);
    expect(await writesOf(t.sqlite, () => settings.setSyncState("steps", {}))).toBe(0);
    await settings.setSyncState("heart-rate", { backfillDaysDone: 3, backfillDaysTotal: 180, lastError: "http_503" });
    expect((await settings.readSyncState()).map((r) => r.type).sort()).toEqual(["heart-rate", "steps"]);
  });

  it("clearSyncErrors clears every error; rewindSyncCursor only moves back and skips a type with no cursor", async () => {
    const { settings } = t.store;
    await settings.setSyncState("a", { syncedThrough: 1000, lastError: "x" });
    await settings.setSyncState("b", { lastError: "y" });
    await settings.setSyncState("hydration-log", { syncedThrough: 1000 });
    await settings.setSyncState("nutrition-log", { lastAttemptAt: 1 });
    await settings.clearSyncErrors();
    expect((await settings.readSyncState()).every((r) => r.lastError === null)).toBe(true);
    expect(await writesOf(t.sqlite, () => settings.clearSyncErrors())).toBe(0);
    await settings.rewindSyncCursor("hydration-log", 400);
    await settings.rewindSyncCursor("a", 2000); // later: never forward
    await settings.rewindSyncCursor("nutrition-log", 400); // no cursor: left alone
    expect((await settings.getSyncState("hydration-log"))?.syncedThrough).toBe(400);
    expect((await settings.getSyncState("a"))?.syncedThrough).toBe(1000);
    expect((await settings.getSyncState("nutrition-log"))?.syncedThrough).toBeNull();
    await settings.clearSynced();
    expect(await settings.readSyncState()).toEqual([]);
  });
});

describe("dashboard", () => {
  it("keeps the chosen order; [] clears; repeating the same choice writes nothing", async () => {
    const { settings } = t.store;
    expect(await settings.dashboardKeys()).toEqual([]);
    await settings.saveDashboard(["sleep", "hrv", "rhr"]);
    expect(await settings.dashboardKeys()).toEqual(["sleep", "hrv", "rhr"]);
    expect(await writesOf(t.sqlite, () => settings.saveDashboard(["sleep", "hrv", "rhr"]))).toBe(0);
    await settings.saveDashboard(["rhr", "sleep"]);
    expect(await settings.dashboardKeys()).toEqual(["rhr", "sleep"]);
    await settings.saveDashboard([]);
    expect(await settings.dashboardKeys()).toEqual([]);
  });
});

describe("profile", () => {
  const input = { birthDate: "1990-05-01", sex: "male" as const, maxHr: null, heightCm: 180, timeZone: "Asia/Kolkata" };
  it("is null before onboarding; saves; says false and writes nothing for the same values (updatedAt alone never counts)", async () => {
    const { profile } = t.store;
    expect(await profile.getProfileRow()).toBeNull();
    expect(await profile.userTimeZone()).toBeNull();
    expect(await profile.saveProfile(input, 100)).toBe(true);
    expect(await profile.getProfileRow()).toEqual({ ...input, updatedAt: 100 });
    expect(await profile.userTimeZone()).toBe("Asia/Kolkata");
    expect(await writesOf(t.sqlite, async () => expect(await profile.saveProfile(input, 200)).toBe(false))).toBe(0);
    expect((await profile.getProfileRow())?.updatedAt).toBe(100);
    expect(await profile.saveProfile({ ...input, maxHr: 190 }, 300)).toBe(true);
    expect(await profile.getProfileRow()).toEqual({ ...input, maxHr: 190, updatedAt: 300 });
    expect(await profile.saveProfile({ ...input, maxHr: 190, heightCm: null, sex: "female" }, 400)).toBe(true);
    expect(t.sqlite.prepare("select count(*) n from profile").get()).toEqual({ n: 1 });
  });
});

describe("coach settings", () => {
  it("setConsent keeps the first consent time and does not rewrite when unchanged", async () => {
    const { coach } = t.store;
    expect(await coach.getSettings()).toBeNull();
    await coach.setConsent(true, 10);
    expect(await coach.getSettings()).toMatchObject({ consentAt: 10, provider: null, updatedAt: 10 });
    expect(await writesOf(t.sqlite, () => coach.setConsent(true, 20))).toBe(0);
    await coach.setConsent(false, 30);
    expect(await coach.getSettings()).toMatchObject({ consentAt: null, updatedAt: 30 });
    expect(await writesOf(t.sqlite, () => coach.setConsent(false, 40))).toBe(0);
  });

  it("setPreferences sets only the keys present; saveProvider and removeProvider", async () => {
    const { coach } = t.store;
    await coach.setPreferences({ instructions: "short answers" }, 1);
    await coach.setPreferences({ briefMinute: 450 }, 2);
    expect(await coach.getSettings()).toMatchObject({ customInstructions: "short answers", briefMinute: 450 });
    await coach.setPreferences({ briefMinute: null }, 3);
    expect(await coach.getSettings()).toMatchObject({ customInstructions: "short answers", briefMinute: null });
    expect(await writesOf(t.sqlite, () => coach.setPreferences({ instructions: "short answers" }, 4))).toBe(0);
    await coach.saveProvider("anthropic", "claude", "abcd", 5);
    expect(await coach.getSettings()).toMatchObject({ provider: "anthropic", model: "claude", keyLast4: "abcd", customInstructions: "short answers" });
    expect(await writesOf(t.sqlite, () => coach.saveProvider("anthropic", "claude", "abcd", 6))).toBe(0);
    await coach.removeProvider(7);
    expect(await coach.getSettings()).toMatchObject({ provider: null, model: null, keyLast4: null, updatedAt: 7 });
    expect(await writesOf(t.sqlite, () => coach.removeProvider(8))).toBe(0);
  });

  it("removeProvider before any settings does nothing", async () => {
    await t.store.coach.removeProvider(1);
    expect(await t.store.coach.getSettings()).toBeNull();
  });

  it("claimBriefDay wins once per day, and needs a settings row (pulse's update)", async () => {
    const { coach } = t.store;
    expect(await coach.claimBriefDay("2026-10-02")).toBe(false);
    await coach.setConsent(true, 1);
    expect(await coach.claimBriefDay("2026-10-02")).toBe(true);
    expect(await coach.claimBriefDay("2026-10-02")).toBe(false);
    expect(await coach.claimBriefDay("2026-10-01")).toBe(false);
    expect(await coach.claimBriefDay("2026-10-03")).toBe(true);
    expect((await coach.getSettings())?.lastBriefDay).toBe("2026-10-03");
  });
});

describe("coach chats", () => {
  const msgs = (text: string) => [{ id: "m1", role: "user", parts: [{ type: "text", text }] }];

  it("saves, loads, keeps createdAt on update, bumps updatedAt only on a real change", async () => {
    const { coach } = t.store;
    expect(await coach.loadChat("c1")).toBeNull();
    await coach.saveChat("c1", "Hello", msgs("hello"), 100);
    expect(await coach.loadChat("c1")).toEqual(msgs("hello"));
    expect(await writesOf(t.sqlite, () => coach.saveChat("c1", "Hello", msgs("hello"), 200))).toBe(0);
    await coach.saveChat("c1", "Hello again", msgs("hello again"), 300);
    expect(await coach.exportChats()).toEqual([{ id: "c1", title: "Hello again", messages: msgs("hello again"), createdAt: 100, updatedAt: 300 }]);
  });

  it("lists newest first in pages with a cursor (ties broken by id)", async () => {
    const { coach } = t.store;
    for (let i = 0; i < CHAT_PAGE + 5; i++) await coach.saveChat(`c${String(i).padStart(3, "0")}`, `t${i}`, [], 1000 + Math.floor(i / 2));
    const first = await coach.listChats();
    expect(first.chats).toHaveLength(CHAT_PAGE);
    expect(first.chats[0].id).toBe(`c${String(CHAT_PAGE + 4).padStart(3, "0")}`);
    expect(first.next).not.toBeNull();
    const second = await coach.listChats(first.next!);
    expect(second.chats).toHaveLength(5);
    expect(second.next).toBeNull();
    const ids = [...first.chats, ...second.chats].map((c) => c.id);
    expect(new Set(ids).size).toBe(CHAT_PAGE + 5);
    // newest updatedAt first, and within one updatedAt the larger id first
    expect(ids.slice(0, 2)).toEqual([`c${String(CHAT_PAGE + 4).padStart(3, "0")}`, `c${String(CHAT_PAGE + 3).padStart(3, "0")}`]);
  });

  it("claimChat replaces the messages only while they still equal `before`, so an answer applies once", async () => {
    const { coach } = t.store;
    await coach.saveChat("c1", "t", msgs("ask"), 1);
    expect(await coach.claimChat("c1", msgs("other"), msgs("x"), 2)).toBe(false);
    expect(await coach.claimChat("c1", msgs("ask"), msgs("answered"), 3)).toBe(true);
    expect(await coach.claimChat("c1", msgs("ask"), msgs("answered twice"), 4)).toBe(false);
    expect(await coach.loadChat("c1")).toEqual(msgs("answered"));
    expect(await coach.claimChat("missing", [], [], 5)).toBe(false);
  });

  it("deletes one chat and all chats", async () => {
    const { coach } = t.store;
    await coach.saveChat("a", "a", [], 1);
    await coach.saveChat("b", "b", [], 2);
    await coach.deleteChat("a");
    expect((await coach.listChats()).chats.map((c) => c.id)).toEqual(["b"]);
    await coach.deleteAllChats();
    expect((await coach.exportChats())).toEqual([]);
  });
});
