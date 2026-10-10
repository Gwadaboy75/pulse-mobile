// An in-memory Store for the pipeline's tests until stream A's SQLite repositories land. It implements the methods the
// pipeline, loadSeed and the tests use, each to its documented contract in src/data/repos; any other method rejects.
// JSON columns are kept as JSON text, as SQLite keeps them, so every read is a fresh parse and diff-only writes compare
// the text. `writes` counts the rows inserted, changed or deleted, so a test can prove an unchanged run writes nothing.
import { canon, type ScoreRows } from "../../testing/canonical";
import type { Tables } from "../../testing/fixtures";
import type { Repos, Store } from "../../data/repos";
import type { DailyMetricsRow, DailyRepo } from "../../data/repos/daily";
import type { JournalEntryRow, JournalRepo } from "../../data/repos/journal";
import type { Sample, SamplesRepo, SampleTable } from "../../data/repos/samples";
import type { FoldCheckpoint, ScoreRow, ScoresRepo, Stage2Write } from "../../data/repos/scores";
import type { SeriesRepo } from "../../data/repos/series";
import type { ExerciseWrite, Segment, SessionsRepo, SleepSessionRow } from "../../data/repos/sessions";
import { byteCompare } from "../data";

const DAY = 86_400;
const bucketOf = (ts: number) => Math.floor(ts / DAY);

/** The JSON columns of daily_scores, as text. */
const JSON_COLS = ["strain", "activities", "recovery", "sleep", "trainingLoad", "strainTarget", "sleepPlanner", "energyBank", "stress", "healthMonitor", "healthspan", "fitness", "journalImpact"] as const;
type ScoreRec = { scoringVersion: number; sessionRhrBpm: number | null } & Record<(typeof JSON_COLS)[number], string | null>;

type State = {
  metrics: Map<string, DailyMetricsRow>;
  sessions: Map<string, SleepSessionRow>;
  segments: Map<string, Segment[]>;
  exercises: Map<string, ExerciseWrite>;
  samples: Record<SampleTable, Map<number, { offsets: number[]; values: number[]; minute?: boolean }>>;
  entries: Map<string, JournalEntryRow>;
  scores: Map<string, ScoreRec>;
  series: Map<string, Map<string, string>>;
  reports: Map<string, string>;
  checkpoint: FoldCheckpoint | null;
  dirty: Set<string>;
};

const emptyState = (): State => ({
  metrics: new Map(),
  sessions: new Map(),
  segments: new Map(),
  exercises: new Map(),
  samples: { hr: new Map(), steps: new Map() },
  entries: new Map(),
  scores: new Map(),
  series: new Map(),
  reports: new Map(),
  checkpoint: null,
  dirty: new Set(),
});

const text = (v: unknown) => (v == null ? null : JSON.stringify(v));
const parse = <T>(s: string | null) => (s == null ? null : (JSON.parse(s) as T));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byStart = <T extends { startTs: number; id: string }>(a: T, b: T) => a.startTs - b.startTs || byteCompare(a.id, b.id);

/** A repository with only some methods: the rest reject, so a test never passes on a method nobody implemented. */
const partial = <T extends object>(name: string, impl: Partial<T>): T =>
  new Proxy(impl, {
    get: (t, k) => (t as Record<string | symbol, unknown>)[k] ?? (() => Promise.reject(new Error(`memoryStore: ${name}.${String(k)} is not implemented`))),
  }) as T;

export type MemoryStore = Store & { readonly writes: number; clone(): MemoryStore };

export function memoryStore(initial: State = emptyState()): MemoryStore {
  let s = initial;
  let writes = 0;

  const daily = partial<DailyRepo>("daily", {
    async readMetrics() {
      return [...s.metrics.values()]
        .sort((a, b) => byteCompare(a.day, b.day))
        .map(({ hrvDeepMs: _d, rhrMethod: _m, source: _s, ...m }) => structuredClone(m));
    },
    async upsertDailyMetrics(rows) {
      const last = new Map(rows.map((r) => [r.day, r]));
      const changed: string[] = [];
      for (const [day, patch] of last) {
        const stored = s.metrics.get(day);
        if (stored && Object.entries(patch).every(([k, v]) => same(stored[k as keyof DailyMetricsRow], v))) continue;
        const base = stored ?? (Object.fromEntries(METRIC_COLS.map((k) => [k, null])) as unknown as DailyMetricsRow);
        s.metrics.set(day, structuredClone({ ...base, ...patch }));
        changed.push(day);
        writes++;
      }
      return changed;
    },
  });

  const sessions = partial<SessionsRepo>("sessions", {
    async readSessions() {
      return [...s.sessions.values()].sort(byStart).map(({ source: _s, ...r }) => ({ ...r }));
    },
    async readExercises() {
      return [...s.exercises.values()].sort(byStart).map(({ source: _s, distanceM: _d, ...r }) => ({ ...r }));
    },
    async readSegments() {
      return [...s.segments.values()].flat().sort((a, b) => a.startTs - b.startTs).map((g) => ({ ...g }));
    },
    async upsertSleepSessions(rows) {
      const changed: string[] = [];
      for (const r of rows) {
        if (same(s.sessions.get(r.id), r)) continue;
        s.sessions.set(r.id, { ...r });
        changed.push(r.id);
        writes++;
      }
      return changed;
    },
    async replaceSegments(sessionIds, next) {
      const changed: string[] = [];
      for (const id of sessionIds) {
        const now = next.filter((g) => g.sessionId === id).sort((a, b) => a.startTs - b.startTs);
        const was = s.segments.get(id) ?? [];
        const key = (gs: Segment[]) => JSON.stringify(gs.map((g) => [g.startTs, g.endTs, g.stage]));
        if (key(was) === key(now)) continue;
        writes += was.length + now.length;
        if (now.length) s.segments.set(id, now.map((g) => ({ ...g })));
        else s.segments.delete(id);
        changed.push(id);
      }
      return changed;
    },
    async upsertExercises(rows) {
      const changed: string[] = [];
      for (const r of rows) {
        if (same(s.exercises.get(r.id), r)) continue;
        s.exercises.set(r.id, { ...r });
        changed.push(r.id);
        writes++;
      }
      return changed;
    },
    async pruneSleepSessions(win, returnedIds) {
      const keep = new Set(returnedIds);
      const days: string[] = [];
      for (const r of [...s.sessions.values()]) {
        if (r.endTs < win.start || r.endTs >= win.end || keep.has(r.id)) continue;
        writes += 1 + (s.segments.get(r.id)?.length ?? 0);
        s.sessions.delete(r.id);
        s.segments.delete(r.id); // cascade
        days.push(r.day);
      }
      return days;
    },
  });

  const readSamples = async (table: SampleTable, lo: number, hi: number): Promise<Sample[]> => {
    const out: Sample[] = [];
    if (hi <= lo) return out;
    for (let b = bucketOf(lo); b <= bucketOf(hi - 1); b++) {
      const r = s.samples[table].get(b);
      if (!r) continue;
      for (let i = 0; i < r.offsets.length; i++) {
        const ts = b * DAY + r.offsets[i];
        if (ts >= lo && ts < hi) out.push({ ts, v: r.values[i] });
      }
    }
    return out;
  };
  const samples = partial<SamplesRepo>("samples", {
    readSamples,
    async readHr(lo, hi) {
      return (await readSamples("hr", lo, hi)).map((x) => ({ ts: x.ts, bpm: x.v }));
    },
    async sampleRange(table) {
      const buckets = [...s.samples[table].keys()].sort((a, b) => a - b);
      if (!buckets.length) return null;
      const first = s.samples[table].get(buckets[0])!;
      const last = s.samples[table].get(buckets.at(-1)!)!;
      return { min: buckets[0] * DAY + first.offsets[0], max: buckets.at(-1)! * DAY + last.offsets.at(-1)! };
    },
    async writeSamples(table, xs) {
      const byBucket = new Map<number, Sample[]>();
      for (const x of xs) {
        const b = bucketOf(x.ts);
        if (!byBucket.has(b)) byBucket.set(b, []);
        byBucket.get(b)!.push(x);
      }
      for (const [b, list] of byBucket) {
        const stored = s.samples[table].get(b);
        const merged = new Map<number, number>();
        if (stored) for (let i = 0; i < stored.offsets.length; i++) merged.set(b * DAY + stored.offsets[i], stored.values[i]);
        const n = merged.size;
        for (const x of list) if (!merged.has(x.ts)) merged.set(x.ts, x.v); // stored wins (insert-or-ignore)
        if (stored && merged.size === n) continue;
        const sorted = [...merged].sort((a, z) => a[0] - z[0]);
        s.samples[table].set(b, { offsets: sorted.map(([ts]) => ts - b * DAY), values: sorted.map(([, v]) => v), ...(table === "hr" && { minute: stored?.minute ?? false }) });
        writes++;
      }
    },
  });

  const journal = partial<JournalRepo>("journal", {
    async entriesForScoring() {
      return [...s.entries.values()].sort((a, b) => byteCompare(a.day, b.day) || byteCompare(a.tag, b.tag)).map(({ day, tag, value }) => ({ day, tag, value }));
    },
    async saveEntry(e) {
      const k = `${e.day}\u0000${e.tag}`;
      if (same(s.entries.get(k), e)) return false;
      s.entries.set(k, { ...e });
      writes++;
      return true;
    },
  });

  const newScore = (): ScoreRec => ({ scoringVersion: 0, sessionRhrBpm: null, ...(Object.fromEntries(JSON_COLS.map((k) => [k, null])) as Record<(typeof JSON_COLS)[number], null>) });
  const dropOutside = <V>(m: Map<string, V>, first: string, last: string) => {
    for (const day of [...m.keys()]) if (day < first || day > last) {
      m.delete(day);
      writes++;
    }
  };
  const scores = partial<ScoresRepo>("scores", {
    async readDays(from, to) {
      return [...s.scores]
        .filter(([day]) => day >= from && day <= to)
        .sort(([a], [b]) => byteCompare(a, b))
        .map(([day, r]): ScoreRow => ({
          day,
          strain: parse(r.strain),
          activities: parse(r.activities),
          sessionRhr: r.sessionRhrBpm,
          recovery: parse(r.recovery),
          sleep: parse(r.sleep),
          trainingLoad: parse(r.trainingLoad),
          strainTarget: parse(r.strainTarget),
          sleepPlanner: parse(r.sleepPlanner),
          energyBank: parse(r.energyBank),
          stress: parse(r.stress),
          healthMonitor: parse(r.healthMonitor),
          healthspan: parse(r.healthspan),
          fitness: parse(r.fitness),
        }));
    },
    async stage1Stored() {
      return [...s.scores].map(([day, r]) => ({ day, scoringVersion: r.scoringVersion, key: parse<{ key?: string }>(r.strain)?.key ?? null }));
    },
    async writeStage1(rows) {
      for (const r of rows) {
        const was = s.scores.get(r.day);
        const now = { ...(was ?? newScore()), strain: text(r.strain), activities: text(r.activities), sessionRhrBpm: r.sessionRhrBpm };
        if (was && same(was, now)) continue;
        s.scores.set(r.day, now);
        writes++;
      }
    },
    async readStage2Inputs() {
      return [...s.scores].map(([day, r]) => ({
        day,
        strain: parse(r.strain),
        activities: parse(r.activities),
        sessionRhr: r.sessionRhrBpm,
        recovery: parse(r.recovery),
        impact: parse(r.journalImpact),
      }));
    },
    async writeStage2(rows: Stage2Write[]) {
      for (const { day, scoringVersion, ...cols } of rows) {
        const was = s.scores.get(day);
        const now: ScoreRec = { ...(was ?? newScore()), scoringVersion };
        for (const [k, v] of Object.entries(cols)) now[k as (typeof JSON_COLS)[number]] = text(v);
        if (was && same(was, now)) continue;
        s.scores.set(day, now);
        writes++;
      }
    },
    async deleteOutside(first, last) {
      dropOutside(s.scores, first, last);
    },
    async needsRecompute(v) {
      if (s.dirty.size) return true;
      for (const r of s.scores.values()) if (r.scoringVersion !== v) return true;
      const days = [...s.metrics.keys()].sort(byteCompare);
      return days.length > 0 && !s.scores.has(days.at(-1)!);
    },
    async readCheckpoint() {
      return s.checkpoint && { ...s.checkpoint };
    },
    async writeCheckpoint(c) {
      if (same(s.checkpoint, c)) return;
      s.checkpoint = { ...c };
      writes++;
    },
    async deleteCheckpoint() {
      if (!s.checkpoint) return;
      s.checkpoint = null;
      writes++;
    },
    async dirtyDays() {
      return [...s.dirty];
    },
    async markDirty(days) {
      for (const d of days) if (!s.dirty.has(d)) {
        s.dirty.add(d);
        writes++;
      }
    },
    async clearDirty() {
      writes += s.dirty.size;
      s.dirty.clear();
    },
    async writeReports(rows) {
      for (const r of rows) {
        const t = JSON.stringify(r.data);
        if (s.reports.get(r.period) === t) continue;
        s.reports.set(r.period, t);
        writes++;
      }
    },
    async deleteReportsExcept(keep) {
      const k = new Set(keep);
      for (const p of [...s.reports.keys()]) if (!k.has(p)) {
        s.reports.delete(p);
        writes++;
      }
    },
    async listReports() {
      return [...s.reports].sort(([a], [b]) => byteCompare(b, a)).map(([period, data]) => ({ period, data: JSON.parse(data) }));
    },
    async clearSynced() {
      writes += s.scores.size + s.reports.size + s.dirty.size + (s.checkpoint ? 1 : 0);
      s.scores.clear();
      s.reports.clear();
      s.dirty.clear();
      s.checkpoint = null;
    },
  });

  const series = partial<SeriesRepo>("series", {
    async upsertSeries(rows) {
      for (const r of rows) {
        const t = JSON.stringify(r.data);
        const kinds = s.series.get(r.day) ?? new Map<string, string>();
        if (kinds.get(r.kind) === t) continue;
        kinds.set(r.kind, t);
        s.series.set(r.day, kinds);
        writes++;
      }
    },
    async readSeries(kinds, from, to) {
      const out = [];
      for (const [day, m] of s.series) {
        if (day < from || day > to) continue;
        for (const kind of kinds) if (m.has(kind)) out.push({ day, kind, data: JSON.parse(m.get(kind)!) as (number | null)[] });
      }
      return out;
    },
    async deleteSeries(kind, days) {
      for (const d of days) if (s.series.get(d)?.delete(kind)) writes++;
    },
    async deleteOutside(first, last) {
      for (const [day, m] of [...s.series]) if (day < first || day > last) {
        writes += m.size;
        s.series.delete(day);
      }
    },
    async clearSynced() {
      for (const m of s.series.values()) writes += m.size;
      s.series.clear();
    },
  });

  const repos: Repos = {
    daily,
    sessions,
    samples,
    journal,
    scores,
    series,
    log: partial("log", {}),
    profile: partial("profile", {}),
    settings: partial("settings", {}),
    coach: partial("coach", {}),
  };

  // One transaction at a time; a rejected one restores the state it started from.
  let queue: Promise<unknown> = Promise.resolve();
  const transaction = <T>(fn: (tx: Repos) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const before = structuredClone(s);
      const w = writes;
      try {
        return await fn(repos);
      } catch (e) {
        s = before;
        writes = w;
        throw e;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    ...repos,
    transaction,
    get writes() {
      return writes;
    },
    clone: () => memoryStore(structuredClone(s)),
  };
}

const METRIC_COLS = [
  "hrvMs", "hrvDeepMs", "rhrBpm", "rhrMethod", "respBpm", "nightlyTempC", "spo2Pct", "vo2maxDaily", "vo2maxRun", "steps", "calories", "weightKg",
  "bodyFatPct", "hrZones", "lightModerateMin", "vigorousPeakMin", "tempBaselineC", "tempSdC", "rhrRangeLow", "rhrRangeHigh", "hrvRangeLow", "hrvRangeHigh",
] as const;

const camel = (k: string) => k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
const camelRow = <T>(r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])) as T;

/**
 * Fills a store from a seed fixture (F2's `tables`, or F4's `seed`) through the repository interfaces only, so it works
 * on any Store: the tables the pipeline reads (daily_metrics, sessions and segments, exercises, heart rate and steps,
 * journal entries) and the dirty marks. Roll-ups, health records, tags and sync state are not read by the pipeline.
 */
export async function loadSeed(store: Repos, { tables }: { tables: Tables }) {
  const t = (name: string) => tables[name] ?? [];
  await store.daily.upsertDailyMetrics(t("daily_metrics").map((r) => camelRow(r)));
  const sessions = t("sleep_sessions").map((r) => camelRow<SleepSessionRow>(r));
  await store.sessions.upsertSleepSessions(sessions);
  await store.sessions.replaceSegments(sessions.map((x) => x.id), t("sleep_segments").map((r) => camelRow<Segment>(r)));
  await store.sessions.upsertExercises(t("exercises").map((r) => camelRow<ExerciseWrite>(r)));
  for (const [name, table] of [["hr_days", "hr"], ["steps_days", "steps"]] as const) {
    const xs: Sample[] = [];
    for (const r of t(name) as { bucket: number; offsets: number[]; values: number[] }[])
      for (let i = 0; i < r.offsets.length; i++) xs.push({ ts: r.bucket * DAY + r.offsets[i], v: r.values[i] });
    await store.samples.writeSamples(table, xs);
  }
  for (const e of t("journal_entries")) await store.journal.saveEntry(camelRow<JournalEntryRow>(e));
  await store.scores.markDirty(t("intraday_dirty").map((r) => r.day as string));
}

const KINDS = ["energy_bank", "hr", "load", "still_hr", "stress"];
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Every daily_scores, intraday_series and reports row as the fixtures hold them: pulse's column names, canonical
 * (sorted keys, 10 significant digits), daily_scores by day, series by kind then day, reports by period. Through the
 * repository interfaces only.
 */
export async function dump(store: Repos): Promise<ScoreRows> {
  const all = ["0000-01-01", "9999-12-31"] as const;
  const [rows, versions, inputs, series, reports] = await Promise.all([
    store.scores.readDays(...all),
    store.scores.stage1Stored(),
    store.scores.readStage2Inputs(),
    store.series.readSeries(KINDS, ...all),
    store.scores.listReports(),
  ]);
  const version = new Map(versions.map((r) => [r.day, r.scoringVersion]));
  const impact = new Map(inputs.map((r) => [r.day, r.impact]));
  return {
    daily_scores: rows.map(({ sessionRhr, ...r }) =>
      canon({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [snake(k), v])), session_rhr_bpm: sessionRhr, scoring_version: version.get(r.day), journal_impact: impact.get(r.day) }) as Record<string, unknown>,
    ),
    intraday_series: series
      .sort((a, b) => byteCompare(a.kind, b.kind) || byteCompare(a.day, b.day))
      .map((r) => canon({ day: r.day, kind: r.kind, data: r.data }) as Record<string, unknown>),
    reports: reports.reverse().map((r) => canon({ period: r.period, data: r.data }) as Record<string, unknown>),
  };
}

/** The first row and key where two dumps differ, with both values, or null when they are equal. */
export function firstDiff(actual: ScoreRows, expected: ScoreRows): string | null {
  for (const table of ["daily_scores", "intraday_series", "reports"] as const) {
    const a = actual[table];
    const e = expected[table];
    for (let i = 0; i < Math.max(a.length, e.length); i++) {
      const id = JSON.stringify(e[i] ? [e[i].day ?? e[i].period, e[i].kind] : [a[i]?.day ?? a[i]?.period, a[i]?.kind]);
      if (!a[i] || !e[i]) return `${table}[${i}] ${id}: ${a[i] ? "extra" : "missing"} row`;
      for (const k of new Set([...Object.keys(a[i]), ...Object.keys(e[i])])) {
        if (!same(a[i][k], e[i][k])) return `${table}[${i}] ${id} .${k}: actual ${JSON.stringify(a[i][k])} expected ${JSON.stringify(e[i][k])}`;
      }
    }
  }
  return null;
}
