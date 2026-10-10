// Device and account state that is not health data: the `settings` key-value table, the per-type sync cursors
// (sync_state) and Home's My Dashboard choice (dashboard_metrics). Replaces pulse server_settings, the non-secret half
// of oauth_tokens, push_subscriptions' once-a-day claims, sync_state access in sources/google/sync.ts, queries/settings.ts,
// log.ts and actions/dashboard.ts. Secrets (Google tokens, the coach key) are in the secure store, never here.
// There is no Google account identity (email, name, picture) anywhere: the app asks for Health scopes only.
import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { dashboardMetrics, settings, syncState } from "../schema";
import type { Db } from "../types";
import { atomic, excluded, upsertChanged } from "./sql";

/** The keys in the `settings` table and the JSON each holds. */
export type SettingValues = {
  /** The non-secret part of the Google grant: granted scopes (space separated) and when access was revoked. Tokens and their expiry are in the secure store. */
  "google.grant": { scope: string; revokedAt: number | null; updatedAt: number };
  /** The last local day the "recovery ready" / "sync problem" notification went out (YYYY-MM-DD). push.ts:61 `claim` */
  "notify.lastRecoveryDay": string;
  "notify.lastSyncAlertDay": string;
  /** Notification toggles (later). */
  "notify.recovery": boolean;
  "notify.syncProblem": boolean;
  theme: "system" | "light" | "dark";
  /** Onboarding's "Explore with sample data": the database holds the generated demo, not the person's own data. */
  sample: boolean;
  /** The Journal has offered "Log yesterday" once (docs/onboarding.md): it never opens the sheet on its own again. */
  "journal.yesterdayOffered": boolean;
};
export type SettingKey = keyof SettingValues;
/** The keys `claimDay` works on. */
export type ClaimKey = "notify.lastRecoveryDay" | "notify.lastSyncAlertDay";

/** One sync_state row (per Google data type, or "paired-devices" / "logged-entries"). `lastError` is status and code only. */
export type SyncStateRow = {
  type: string;
  syncedThrough: number | null;
  backfillDaysDone: number | null;
  backfillDaysTotal: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
};

export interface SettingsRepo {
  // ── Key-value ────────────────────────────────────────────────────────────
  /** The parsed value, or null when unset. */
  get<K extends SettingKey>(key: K): Promise<SettingValues[K] | null>;
  /** Stores the value as JSON; nothing is written when it equals the stored one. */
  set<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void>;
  remove(key: SettingKey): Promise<void>;
  /**
   * The atomic once-a-day claim: stores `day` and returns true only when the key was unset or held an earlier day, so
   * two concurrent runs cannot both send the alert. Claimed before sending, as pulse does. push.ts:61 `claim`
   */
  claimDay(key: ClaimKey, day: string): Promise<boolean>;

  // ── Sync cursors ─────────────────────────────────────────────────────────
  /** Every row. queries/settings.ts:58 `syncRows` */
  readSyncState(): Promise<SyncStateRow[]>;
  /** One type's row. sources/google/sync.ts:178 */
  getSyncState(type: string): Promise<SyncStateRow | null>;
  /** Upserts the given fields of a type's row (others stay); nothing is written when they already equal the stored ones. sources/google/sync.ts:116 `setState` */
  setSyncState(type: string, patch: Partial<Omit<SyncStateRow, "type">>): Promise<void>;
  /** Clears every row's `lastError` (Settings "retry"). app/(app)/settings/actions.ts:24 */
  clearSyncErrors(): Promise<void>;
  /** Moves a type's `syncedThrough` back to `at` when it is later; never forward, and a type with no cursor is left alone. log.ts:248 `rewindSync` */
  rewindSyncCursor(type: string, at: number): Promise<void>;

  // ── My Dashboard ─────────────────────────────────────────────────────────
  /** The chosen metric keys in order (no rows: the default list, which the port decides). queries/home.ts:237 `dashboardKeys` */
  dashboardKeys(): Promise<string[]>;
  /** Replaces the choice in one transaction; `[]` clears it (the default list is stored as no rows). actions/dashboard.ts:31 */
  saveDashboard(keys: string[]): Promise<void>;

  /** Deletes sync_state (a Google account switch). avatar.ts:45 */
  clearSynced(): Promise<void>;
}

export function settingsRepo(db: Db): SettingsRepo {
  const s = settings;
  const st = syncState;
  const syncCols = { type: st.type, syncedThrough: st.syncedThrough, backfillDaysDone: st.backfillDaysDone, backfillDaysTotal: st.backfillDaysTotal, lastAttemptAt: st.lastAttemptAt, lastSuccessAt: st.lastSuccessAt, lastError: st.lastError };
  return {
    async get(key) {
      const [r] = db.select({ value: s.value }).from(s).where(eq(s.key, key)).all();
      return r ? JSON.parse(r.value) : null;
    },
    async set(key, value) {
      upsertChanged(db, s, ["key"], [{ key, value: JSON.stringify(value) }]);
    },
    async remove(key) {
      db.delete(s).where(eq(s.key, key)).run();
    },
    async claimDay(key, day) {
      // One statement, so two runs cannot both win: the row is written only when unset or holding an earlier day.
      const won = db
        .insert(s)
        .values({ key, value: JSON.stringify(day) })
        .onConflictDoUpdate({ target: s.key, set: { value: excluded(s.value) }, setWhere: sql`json_extract(${s.value}, '$') < ${day}` })
        .returning({ key: s.key })
        .all();
      return won.length > 0;
    },

    async readSyncState() {
      return db.select(syncCols).from(st).all();
    },
    async getSyncState(type) {
      return db.select(syncCols).from(st).where(eq(st.type, type)).all()[0] ?? null;
    },
    async setSyncState(type, patch) {
      upsertChanged(db, st, ["type"], [{ type, ...patch }]);
    },
    async clearSyncErrors() {
      db.update(st).set({ lastError: null }).where(isNotNull(st.lastError)).run();
    },
    async rewindSyncCursor(type, at) {
      db.update(st).set({ syncedThrough: at }).where(and(eq(st.type, type), isNotNull(st.syncedThrough), gt(st.syncedThrough, at))).run();
    },

    async dashboardKeys() {
      return db.select({ key: dashboardMetrics.key }).from(dashboardMetrics).orderBy(asc(dashboardMetrics.position)).all().map((r) => r.key);
    },
    async saveDashboard(keys) {
      atomic(db, () => {
        const held = db.select({ key: dashboardMetrics.key }).from(dashboardMetrics).orderBy(asc(dashboardMetrics.position)).all().map((r) => r.key);
        if (held.length === keys.length && held.every((k, i) => k === keys[i])) return;
        db.delete(dashboardMetrics).run();
        if (keys.length) db.insert(dashboardMetrics).values(keys.map((key, position) => ({ key, position }))).run();
      });
    },

    async clearSynced() {
      db.delete(st).run();
    },
  };
}
