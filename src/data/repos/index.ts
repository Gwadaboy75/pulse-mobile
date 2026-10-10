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
import { todo } from "./todo";

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

export function createStore(db: Db): Store {
  return { ...createRepos(db), transaction: async () => todo("store.transaction") };
}
