// The drizzle SQLite schema: the contract between work streams (plan, "Data model"). Translated from pulse's
// src/server/db/schema.ts (Postgres). Conventions: one person per install, so there is no `user_id` anywhere;
// timestamps are unix seconds (`integer`, `*_ts`, `*_at`); days are local `YYYY-MM-DD` (`text`); JSON is `text` (JSON
// text keeps key order, which journal impact's memo key depends on); floats are SQLite `real` (8-byte);
// booleans are `integer` 0/1.
//
// No auth tables, invites or account identity: the Google tokens live in the secure store, and the non-secret grant
// goes to `settings`.
// Only src/data/repos may query these tables.
import { check, customType, foreignKey, index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** A BLOB as Uint8Array (Buffer does not exist in React Native; better-sqlite3's Buffer is one). */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "blob" });
const ts = (name: string) => integer(name);
const day = (name: string) => text(name);
const bool = (name: string) => integer(name, { mode: "boolean" });
const json = <T = unknown>(name: string) => text(name, { mode: "json" }).$type<T>();
/** The one row of a single-row table: `id` is always 1. */
const singleRow = () => integer("id").primaryKey().default(1);

/** Per data type (Google type name, or "paired-devices", "logged-entries"). `last_error` holds status and code only, never bodies or tokens. */
export const syncState = sqliteTable("sync_state", {
  type: text("type").primaryKey(),
  syncedThrough: ts("synced_through"),
  backfillDaysDone: integer("backfill_days_done"),
  backfillDaysTotal: integer("backfill_days_total"),
  lastAttemptAt: ts("last_attempt_at"),
  lastSuccessAt: ts("last_success_at"),
  lastError: text("last_error"),
});

/**
 * Band heart rate, one row per UTC day (`bucket` = floor(ts / 86400)): second-of-day offsets and bpm, sorted by
 * offset. `offsets` is delta-encoded varints, `values` is uint8 (the encoding is the samples repository's job: a later
 * stream). `minute`: the day was compacted to one mean per minute (compactHr).
 */
export const hrDays = sqliteTable("hr_days", {
  bucket: integer("bucket").primaryKey(),
  offsets: bytes("offsets").notNull(),
  values: bytes("values").notNull(),
  minute: bool("minute").notNull().default(false),
});

/** Steps per minute (offset = the minute start's second-of-day), same layout as hr_days. Max across sources. */
export const stepsDays = sqliteTable("steps_days", {
  bucket: integer("bucket").primaryKey(),
  offsets: bytes("offsets").notNull(),
  values: bytes("values").notNull(),
});

export const dailyMetrics = sqliteTable("daily_metrics", {
  day: day("day").primaryKey(),
  hrvMs: real("hrv_ms"),
  hrvDeepMs: real("hrv_deep_ms"),
  rhrBpm: real("rhr_bpm"),
  rhrMethod: text("rhr_method"),
  respBpm: real("resp_bpm"),
  nightlyTempC: real("nightly_temp_c"),
  spo2Pct: real("spo2_pct"),
  vo2maxDaily: real("vo2max_daily"),
  vo2maxRun: real("vo2max_run"),
  steps: integer("steps"),
  calories: real("calories"),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  /** Google's heart-rate zones for the day: `[light, moderate, vigorous, peak]` minimum bpm, then the peak maximum. */
  hrZones: json<number[]>("hr_zones"),
  /** Google's all-day time in heart-rate zones, minutes: LIGHT + MODERATE, and VIGOROUS + PEAK. */
  lightModerateMin: real("light_moderate_min"),
  vigorousPeakMin: real("vigorous_peak_min"),
  /** Google's skin-temperature baseline (30-night median) and the 30-night SD of nightly − baseline, °C. */
  tempBaselineC: real("temp_baseline_c"),
  tempSdC: real("temp_sd_c"),
  rhrRangeLow: real("rhr_range_low"),
  rhrRangeHigh: real("rhr_range_high"),
  hrvRangeLow: real("hrv_range_low"),
  hrvRangeHigh: real("hrv_range_high"),
  source: text("source").notNull(),
});

/** `day` is the local wake day. Summary minutes are kept even when stages are missing. */
export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    id: text("id").primaryKey(),
    day: day("day").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    isMain: bool("is_main").notNull(),
    processed: bool("processed").notNull(),
    stagesStatus: text("stages_status"),
    asleepMin: integer("asleep_min"),
    awakeMin: integer("awake_min"),
    deepMin: integer("deep_min"),
    lightMin: integer("light_min"),
    remMin: integer("rem_min"),
    source: text("source").notNull(),
  },
  (t) => [index("sleep_sessions_day").on(t.day)],
);

export const sleepSegments = sqliteTable(
  "sleep_segments",
  {
    sessionId: text("session_id").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    stage: text("stage", { enum: ["awake", "light", "deep", "rem"] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.startTs] }),
    foreignKey({ columns: [t.sessionId], foreignColumns: [sleepSessions.id] }).onDelete("cascade"),
  ],
);

/** `day` is the local start day. `type` is the Google exercise type (e.g. RUNNING, STRENGTH_TRAINING). */
export const exercises = sqliteTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    day: day("day").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    calories: real("calories"),
    distanceM: real("distance_m"),
    source: text("source").notNull(),
  },
  (t) => [index("exercises_day").on(t.day)],
);

export const journalTags = sqliteTable("journal_tags", {
  tag: text("tag").primaryKey(),
  label: text("label").notNull(),
  isDefault: bool("is_default").notNull().default(false),
  /** Hidden from the check-in sheet (More › Behaviours). Past answers stay and still count in insights. */
  hidden: bool("hidden").notNull().default(false),
  /** Order within the tag's check-in group; ties fall back to `seq` (insertion order). */
  position: integer("position").notNull().default(0),
  /** Insertion order. Postgres `serial`; SQLite has none off the primary key, so the repository assigns max(seq) + 1. */
  seq: integer("seq").notNull(),
});

/** Google's daily roll-ups beyond the scored metrics, one row per local day and metric key. Shown, never scored. */
export const dailyValues = sqliteTable(
  "daily_values",
  {
    day: text("day").notNull(), // a date, or 'latest' for height_cm
    key: text("key").notNull(),
    value: real("value").notNull(),
  },
  // The key index serves "every reading of one measurement" (Health › measurements, metric trends).
  (t) => [primaryKey({ columns: [t.day, t.key] }), index("daily_values_key").on(t.key, t.day)],
);

/** Heart-rhythm records (ECG readings, irregular rhythm notifications), one row per Google data point. */
export const healthRecords = sqliteTable(
  "health_records",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["ecg", "irn"] }).notNull(),
    ts: ts("ts").notNull(),
    day: day("day").notNull(),
    /** ECG: classification and average bpm. IRN: alert window count. Never the waveform. */
    data: json("data").notNull(),
  },
  (t) => [index("health_records_ts").on(t.ts)],
);

/** Home's My Dashboard as the user chose it: the metric keys shown, in `position` order. No rows means the default list. */
export const dashboardMetrics = sqliteTable("dashboard_metrics", {
  key: text("key").primaryKey(),
  position: integer("position").notNull(),
});

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    day: day("day").notNull(),
    tag: text("tag").notNull(),
    value: integer("value").notNull(),
    /** The follow-up answer for a "yes" (src/lib/behaviors.ts): minutes after midnight or a count. Null when not asked or skipped. */
    detail: integer("detail"),
  },
  (t) => [primaryKey({ columns: [t.day, t.tag] })],
);

/** The journal's free-text note for a day (journal-02). No row means no note. */
export const journalNotes = sqliteTable("journal_notes", {
  day: day("day").primaryKey(),
  text: text("text").notNull(),
});

/** Days whose HR or steps changed; stage 1 of the pipeline recomputes them, then clears the row. */
export const intradayDirty = sqliteTable("intraday_dirty", {
  day: day("day").primaryKey(),
});

/** One row per day. Stage-1 columns (intraday) and stage-2 columns (folds) are written separately. */
export const dailyScores = sqliteTable("daily_scores", {
  day: day("day").primaryKey(),
  scoringVersion: integer("scoring_version").notNull(),
  // Stage 1
  strain: json("strain"),
  activities: json("activities"),
  sessionRhrBpm: real("session_rhr_bpm"),
  // Stage 2
  recovery: json("recovery"),
  sleep: json("sleep"),
  trainingLoad: json("training_load"),
  strainTarget: json("strain_target"),
  sleepPlanner: json("sleep_planner"),
  energyBank: json("energy_bank"),
  stress: json("stress"),
  healthMonitor: json("health_monitor"),
  healthspan: json("healthspan"),
  fitness: json("fitness"),
  journalImpact: json("journal_impact"),
});

/**
 * Stage 2's fold state after `day` (src/pipeline/stage2.ts): one row, so a run replays only the days after it instead
 * of the whole history. Discarded by the version, profile or first-day checks when it stops applying.
 */
export const foldCheckpoints = sqliteTable(
  "fold_checkpoints",
  {
    id: singleRow(),
    day: day("day").notNull(),
    scoringVersion: integer("scoring_version").notNull(),
    /** The scoring options the fold saw (time zone, birth date, sex, height, max HR) and the history's first day. */
    inputsKey: text("inputs_key").notNull(),
    /** JSON text kept as text (not `mode: "json"`): journal impact's memo key hashes the fold's objects as written. */
    fold: text("fold").notNull(),
  },
  (t) => [check("fold_checkpoints_single_row", sql`${t.id} = 1`)],
);

/** Per-minute series per day; `kind` e.g. "hr", "stress", "energy_bank", "load". */
export const intradaySeries = sqliteTable(
  "intraday_series",
  {
    day: day("day").notNull(),
    kind: text("kind").notNull(),
    data: json<(number | null)[]>("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind] })],
);

/** `period` is an ISO week (`2026-W40`) or a month (`2026-10`). */
export const reports = sqliteTable("reports", {
  period: text("period").primaryKey(),
  data: json("data").notNull(),
});

/** What scoring needs about the person. Absent until onboarding. */
export const profile = sqliteTable(
  "profile",
  {
    id: singleRow(),
    birthDate: day("birth_date").notNull(),
    sex: text("sex", { enum: ["male", "female"] }).notNull(),
    /** Measured max HR; null means estimate it from age. */
    maxHr: integer("max_hr"),
    heightCm: real("height_cm"),
    /** IANA zone the person lives in: their days start at local midnight there. Chosen at onboarding. */
    timeZone: text("time_zone").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [check("profile_single_row", sql`${t.id} = 1`)],
);

/**
 * What the user logged in Pulse (water, food, weight, mood, symptoms, cycle), plus the water, food, weight and body fat
 * logged in other apps, one row per Google data point. `google_name` is the data point's name at Google (null: kept
 * locally only).
 */
export const loggedEntries = sqliteTable(
  "logged_entries",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    ts: ts("ts").notNull(),
    day: day("day").notNull(),
    data: json("data").notNull(),
    googleName: text("google_name"),
    /** `pulse`: logged in Pulse. `google`: logged in another app and brought home by the sync. */
    source: text("source").notNull().default("pulse"),
    /** Google's `dataSource.platform` for an entry from another app (`FITBIT`, `HEALTH_CONNECT`, ...); null for Pulse's own. */
    app: text("app"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("logged_entries_ts").on(t.ts), index("logged_entries_day_type").on(t.day, t.type)],
);

/**
 * The coach: consent, the AI provider and model the user chose, and the last four characters of their key. The key
 * itself lives in the secure store, never here.
 */
export const coachSettings = sqliteTable(
  "coach_settings",
  {
    id: singleRow(),
    consentAt: ts("consent_at"),
    provider: text("provider"),
    model: text("model"),
    keyLast4: text("key_last4"),
    /** The user's own notes on how the coach should talk to them (max 500 characters); appended under the rules. */
    customInstructions: text("custom_instructions"),
    /** Minutes after local midnight to send the "brief ready" notification; null = off. */
    briefMinute: integer("brief_minute"),
    /** The last local day that notification went out. */
    lastBriefDay: day("last_brief_day"),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [check("coach_settings_single_row", sql`${t.id} = 1`)],
);

/** Coach chats: the AI SDK's UIMessage[] as JSON text. */
export const coachChats = sqliteTable(
  "coach_chats",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    messages: json("messages").notNull(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("coach_chats_recent").on(t.updatedAt)],
);

/**
 * Small things a phone needs that lost their server home: `key`, and `value` as JSON text. The keys in use are typed in
 * src/data/repos/settings.ts (`SettingValues`): the non-secret part of the Google grant (scope, revokedAt), the
 * once-a-day claim days of the "recovery ready" and "sync problem" notifications, notification toggles and the theme.
 * No Google account identity (email, name, picture) is stored anywhere: the app asks for Health scopes only.
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
