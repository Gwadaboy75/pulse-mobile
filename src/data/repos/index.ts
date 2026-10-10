// The repositories: the only code that touches SQLite. Each table belongs to exactly one repository (writes); a repository
// may read another's table where a pulse query joins them (`logRepo.waterOn` reads daily_values and sync_state).
//
//   samples   hr_days, steps_days                   heavy BLOB tables (pulse's raw_payloads archive is dropped: nothing read it)
//   series    intraday_series                        per-minute series the pipeline caches
//   scores    daily_scores, fold_checkpoints, reports, intraday_dirty   what the pipeline computes, and its "what to recompute" marks
//   daily     daily_metrics, daily_values, health_records               Google's daily rows
//   sessions  sleep_sessions, sleep_segments, exercises                 sessions and their segments
//   journal   journal_tags, journal_entries, journal_notes              check-ins
//   log       logged_entries                                            the Log
//   profile   profile                                                   one row
//   settings  settings, sync_state, dashboard_metrics                   device and account state, not health data: sync cursors and preferences
//   coach     coach_settings, coach_chats                               the coach
//
// A Google account switch ("forgetSyncedData", pulse avatar.ts:45) is each owner's `clearSynced()` in one `transaction`.
import { sql } from "drizzle-orm";
import type { Db } from "../types";
import { coachRepo, type CoachRepo } from "./coach";
import { dailyRepo, type DailyRepo } from "./daily";
import { journalRepo, type JournalRepo } from "./journal";
import { logRepo, type LogRepo } from "./log";
import { profileRepo, type ProfileRepo } from "./profile";
import { samplesRepo, type SamplesRepo } from "./samples";
import { scoresRepo, type ScoresRepo } from "./scores";
import { seriesRepo, type SeriesRepo } from "./series";
import { sessionsRepo, type SessionsRepo } from "./sessions";
import { settingsRepo, type SettingsRepo } from "./settings";

/** Which repository owns each table (the list above, checked against the schema by src/data/schema.test.ts). */
export const TABLE_OWNER = {
  hr_days: "samples",
  steps_days: "samples",
  intraday_series: "series",
  daily_scores: "scores",
  fold_checkpoints: "scores",
  reports: "scores",
  intraday_dirty: "scores",
  daily_metrics: "daily",
  daily_values: "daily",
  health_records: "daily",
  sleep_sessions: "sessions",
  sleep_segments: "sessions",
  exercises: "sessions",
  journal_tags: "journal",
  journal_entries: "journal",
  journal_notes: "journal",
  logged_entries: "log",
  profile: "profile",
  settings: "settings",
  sync_state: "settings",
  dashboard_metrics: "settings",
  coach_settings: "coach",
  coach_chats: "coach",
} as const;

export type Repos = {
  samples: SamplesRepo;
  series: SeriesRepo;
  scores: ScoresRepo;
  daily: DailyRepo;
  sessions: SessionsRepo;
  journal: JournalRepo;
  log: LogRepo;
  profile: ProfileRepo;
  settings: SettingsRepo;
  coach: CoachRepo;
};

/**
 * The repositories plus `transaction`, which pulse did with `db.transaction`: stage 2's final commit (scores, reports,
 * checkpoint, series, dirty marks), a sync chunk (rows and cursor), saving the profile and marking days dirty. `tx`
 * holds the same repositories bound to the open transaction; the work commits when `fn` resolves and rolls back when it
 * rejects. Transactions never overlap (a second waits). Drizzle's synchronous `db.transaction` cannot take an async
 * callback, so the SQLite implementation issues BEGIN/COMMIT/ROLLBACK on the one connection behind a queue. The in-memory
 * implementation used by the pipeline stream implements this same type.
 */
export type Store = Repos & { transaction<T>(fn: (tx: Repos) => Promise<T>): Promise<T> };

export function createRepos(db: Db): Repos {
  return {
    samples: samplesRepo(db),
    series: seriesRepo(db),
    scores: scoresRepo(db),
    daily: dailyRepo(db),
    sessions: sessionsRepo(db),
    journal: journalRepo(db),
    log: logRepo(db),
    profile: profileRepo(db),
    settings: settingsRepo(db),
    coach: coachRepo(db),
  };
}

/**
 * Empties every table (TABLE_OWNER lists them all; schema.test.ts holds it to the schema). Leaving sample data for the
 * person's own: src/actions/sample.ts runs it inside a transaction. Foreign keys are checked at commit, so the order
 * of the deletes does not matter.
 */
export function clearAllTables(db: Db): void {
  db.run(sql`pragma defer_foreign_keys = on`);
  for (const table of Object.keys(TABLE_OWNER)) db.run(sql.raw(`delete from "${table}"`));
}

export function createStore(db: Db): Store {
  const repos = createRepos(db);
  // Transactions run one after another: each starts when the one before has finished (committed or rolled back).
  let last: Promise<unknown> = Promise.resolve();
  const run = async <T>(fn: (tx: Repos) => Promise<T>): Promise<T> => {
    // IMMEDIATE takes the write lock now, so a second connection (a background task) waits here, not at COMMIT.
    db.run(sql`begin immediate`);
    let result: T;
    try {
      result = await fn(repos);
      db.run(sql`commit`);
    } catch (e) {
      try {
        db.run(sql`rollback`);
      } catch {
        // already rolled back by SQLite (a failed commit can end the transaction): keep the original error
      }
      throw e;
    }
    return result;
  };
  return {
    ...repos,
    // ponytail: one connection, so a write made on `store` (not `tx`) while a transaction is open joins it, and calling
    // `store.transaction` inside a callback waits for itself. The port keeps writes on `tx` inside a callback.
    transaction<T>(fn: (tx: Repos) => Promise<T>): Promise<T> {
      const p = last.then(() => run(fn));
      last = p.catch(() => undefined);
      return p;
    },
  };
}
