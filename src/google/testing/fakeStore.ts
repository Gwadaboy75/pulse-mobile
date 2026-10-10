// A small in-memory `Store` for the Google tests. It implements only the repository methods src/google calls, plus the
// read methods the tests use to look at the result, each as its interface documents it (src/data/repos/*.ts). Any
// other method throws. The tests go through `Store` only, so the orchestrator can run them on the SQLite repositories
// by swapping `createStore` in ./store.ts.
import type { Repos, Store } from "../../data/repos";
import type { DailyMetricsRow, DailyRepo, DailyValue, HealthRecord } from "../../data/repos/daily";
import type { LogRepo, LoggedEntryRow } from "../../data/repos/log";
import type { SamplesRepo } from "../../data/repos/samples";
import type { ScoresRepo } from "../../data/repos/scores";
import type { ExerciseWrite, Segment, SessionsRepo, SleepSessionRow } from "../../data/repos/sessions";
import type { SettingsRepo, SettingValues, SyncStateRow } from "../../data/repos/settings";

type State = {
  metrics: Map<string, DailyMetricsRow>;
  values: Map<string, DailyValue>;
  records: Map<string, HealthRecord>;
  sessions: Map<string, SleepSessionRow>;
  segments: Segment[];
  exercises: Map<string, ExerciseWrite>;
  samples: { hr: Map<number, number>; steps: Map<number, number> };
  dirty: Set<string>;
  syncState: Map<string, SyncStateRow>;
  settings: Map<string, string>;
  log: Map<string, LoggedEntryRow>;
};

const emptyState = (): State => ({
  metrics: new Map(),
  values: new Map(),
  records: new Map(),
  sessions: new Map(),
  segments: [],
  exercises: new Map(),
  samples: { hr: new Map(), steps: new Map() },
  dirty: new Set(),
  syncState: new Map(),
  settings: new Map(),
  log: new Map(),
});

/** Methods not in `impl` throw, so a call the fake does not cover fails loudly instead of returning undefined. */
function partial<T extends object>(name: string, impl: Partial<T>): T {
  return new Proxy(impl as T, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, unknown>)[k] : () => Promise.reject(new Error(`fake store: ${name}.${String(k)} is not implemented`))),
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const blankMetrics = (day: string): DailyMetricsRow => ({
  day, hrvMs: null, hrvDeepMs: null, rhrBpm: null, rhrMethod: null, respBpm: null, nightlyTempC: null, spo2Pct: null, vo2maxDaily: null,
  vo2maxRun: null, steps: null, calories: null, weightKg: null, bodyFatPct: null, hrZones: null, lightModerateMin: null, vigorousPeakMin: null,
  tempBaselineC: null, tempSdC: null, rhrRangeLow: null, rhrRangeHigh: null, hrvRangeLow: null, hrvRangeHigh: null, source: "",
});

export function createFakeStore(): Store {
  const ctx = { s: emptyState() };

  const daily = partial<DailyRepo>("daily", {
    // Diff-only upsert on `day`; a column the rows do not carry stays; the last row of a day wins; returns changed days.
    async upsertDailyMetrics(rows) {
      const last = new Map(rows.map((r) => [r.day, r]));
      const changed: string[] = [];
      for (const [day, r] of last) {
        const held = ctx.s.metrics.get(day);
        const next = { ...(held ?? blankMetrics(day)) } as Record<string, unknown>;
        for (const [k, v] of Object.entries(r)) if (v !== undefined) next[k] = v;
        if (!held || !same(held, next)) {
          ctx.s.metrics.set(day, next as DailyMetricsRow);
          changed.push(day);
        }
      }
      return changed;
    },
    async upsertDailyValues(rows) {
      let n = 0;
      for (const r of new Map(rows.map((x) => [`${x.day}\0${x.key}`, x]))) {
        const held = ctx.s.values.get(r[0]);
        if (!held || held.value !== r[1].value) {
          ctx.s.values.set(r[0], { ...r[1] });
          n++;
        }
      }
      return n;
    },
    async upsertHealthRecords(rows) {
      let n = 0;
      for (const r of new Map(rows.map((x) => [x.id, x])).values()) {
        const held = ctx.s.records.get(r.id);
        if (!held || !same(held, r)) {
          ctx.s.records.set(r.id, structuredClone(r));
          n++;
        }
      }
      return n;
    },
    // The pipeline's columns, oldest first.
    async readMetrics() {
      return [...ctx.s.metrics.values()]
        .sort((a, b) => (a.day < b.day ? -1 : 1))
        .map(({ hrvDeepMs: _d, rhrMethod: _m, source: _s, ...m }) => structuredClone(m));
    },
    async readValuesBetween(from, to) {
      return [...ctx.s.values.values()].filter((v) => v.day !== "latest" && v.day >= from && v.day <= to).map((v) => ({ ...v }));
    },
    async healthRecordsUpTo(day) {
      return [...ctx.s.records.values()].filter((r) => r.day <= day).sort((a, b) => b.ts - a.ts).map((r) => structuredClone(r));
    },
  });

  const sessions = partial<SessionsRepo>("sessions", {
    async upsertSleepSessions(rows) {
      const changed: string[] = [];
      for (const r of new Map(rows.map((x) => [x.id, x])).values()) {
        const held = ctx.s.sessions.get(r.id);
        if (!held || !same(held, r)) {
          ctx.s.sessions.set(r.id, { ...r });
          changed.push(r.id);
        }
      }
      return changed;
    },
    // Compared as the ordered (start, end, stage) list; the delete and insert of one session happen together.
    async replaceSegments(sessionIds, next) {
      const key = (xs: Segment[], id: string) => xs.filter((s) => s.sessionId === id).sort((a, b) => a.startTs - b.startTs).map((s) => [s.startTs, s.endTs, s.stage]);
      const changed = sessionIds.filter((id) => !same(key(ctx.s.segments, id), key(next, id)));
      ctx.s.segments = [...ctx.s.segments.filter((s) => !changed.includes(s.sessionId)), ...next.filter((s) => changed.includes(s.sessionId)).map((s) => ({ ...s }))];
      return changed;
    },
    async upsertExercises(rows) {
      const changed: string[] = [];
      for (const r of new Map(rows.map((x) => [x.id, x])).values()) {
        const held = ctx.s.exercises.get(r.id);
        if (!held || !same(held, r)) {
          ctx.s.exercises.set(r.id, { ...r });
          changed.push(r.id);
        }
      }
      return changed;
    },
    // end_ts in [start, end), id not returned: deleted with its segments; returns the deleted days.
    async pruneSleepSessions(win, returnedIds) {
      const keep = new Set(returnedIds);
      const gone = [...ctx.s.sessions.values()].filter((r) => r.endTs >= win.start && r.endTs < win.end && !keep.has(r.id));
      for (const r of gone) ctx.s.sessions.delete(r.id);
      ctx.s.segments = ctx.s.segments.filter((s) => !gone.some((r) => r.id === s.sessionId));
      return gone.map((r) => r.day);
    },
    async pruneExercises(win, returnedIds) {
      const keep = new Set(returnedIds);
      const gone = [...ctx.s.exercises.values()].filter((r) => r.startTs >= win.start && r.startTs < win.end && !keep.has(r.id));
      for (const r of gone) ctx.s.exercises.delete(r.id);
      return gone.map((r) => r.day);
    },
    async readSessions() {
      return [...ctx.s.sessions.values()].sort((a, b) => a.startTs - b.startTs || (a.id < b.id ? -1 : 1)).map(({ source: _s, ...r }) => ({ ...r }));
    },
    async readExercises() {
      return [...ctx.s.exercises.values()].sort((a, b) => a.startTs - b.startTs || (a.id < b.id ? -1 : 1)).map(({ source: _s, distanceM: _d, ...r }) => ({ ...r }));
    },
    async readSegments() {
      return [...ctx.s.segments].sort((a, b) => a.startTs - b.startTs).map((s) => ({ ...s }));
    },
  });

  const samples = partial<SamplesRepo>("samples", {
    // "replace": inside [start, end) the stored samples become exactly `incoming`; "max": keep the larger per minute,
    // remove nothing. Returns the timestamps whose value changed (added, updated or removed).
    async mergeSamples(table, win, incoming, mode) {
      const m = ctx.s.samples[table];
      const changed: number[] = [];
      if (mode === "replace") {
        for (const ts of [...m.keys()]) {
          if (ts >= win.start && ts < win.end && !incoming.has(ts)) {
            m.delete(ts);
            changed.push(ts);
          }
        }
      }
      for (const [ts, v] of incoming) {
        const before = m.get(ts);
        const after = mode === "max" ? Math.max(v, before ?? v) : v;
        if (before !== after) {
          m.set(ts, after);
          changed.push(ts);
        }
      }
      return changed;
    },
    async lastSample(table) {
      const ks = [...ctx.s.samples[table].keys()];
      return ks.length ? ks.reduce((a, b) => Math.max(a, b)) : null;
    },
    async readSamples(table, lo, hi) {
      return [...ctx.s.samples[table]].filter(([ts]) => ts >= lo && ts < hi).sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({ ts, v }));
    },
    // Stored samples win over the given ones (insert-or-ignore).
    async writeSamples(table, rows) {
      for (const { ts, v } of rows) if (!ctx.s.samples[table].has(ts)) ctx.s.samples[table].set(ts, v);
    },
  });

  const scores = partial<ScoresRepo>("scores", {
    async markDirty(days) {
      for (const d of days) ctx.s.dirty.add(d);
    },
    async dirtyDays() {
      return [...ctx.s.dirty].sort();
    },
    async clearDirty() {
      ctx.s.dirty.clear();
    },
  });

  const syncRow = (type: string): SyncStateRow => ({ type, syncedThrough: null, backfillDaysDone: null, backfillDaysTotal: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null });
  const settings = partial<SettingsRepo>("settings", {
    async get(key) {
      const v = ctx.s.settings.get(key);
      return v === undefined ? null : (JSON.parse(v) as never);
    },
    async set<K extends keyof SettingValues>(key: K, value: SettingValues[K]) {
      ctx.s.settings.set(key, JSON.stringify(value));
    },
    async getSyncState(type) {
      const r = ctx.s.syncState.get(type);
      return r ? { ...r } : null;
    },
    // Upserts the given fields; the others stay.
    async setSyncState(type, patch) {
      ctx.s.syncState.set(type, { ...(ctx.s.syncState.get(type) ?? syncRow(type)), ...patch });
    },
    async readSyncState() {
      return [...ctx.s.syncState.values()].map((r) => ({ ...r }));
    },
    // Deletes sync_state (a Google account switch).
    async clearSynced() {
      ctx.s.syncState.clear();
    },
    // Moves syncedThrough back to `at` when it is later; never forward; a type with no cursor is left alone.
    async rewindSyncCursor(type, at) {
      const r = ctx.s.syncState.get(type);
      if (r && r.syncedThrough !== null && r.syncedThrough > at) r.syncedThrough = at;
    },
  });

  const log = partial<LogRepo>("log", {
    async insertEntry(e) {
      ctx.s.log.set(e.id, { source: "pulse", app: null, ...e });
    },
    async entryById(id) {
      const r = ctx.s.log.get(id);
      return r ? structuredClone(r) : null;
    },
    // Only the given fields change.
    async updateEntry(id, patch) {
      const r = ctx.s.log.get(id);
      if (r) for (const [k, v] of Object.entries(patch)) if (v !== undefined) (r as Record<string, unknown>)[k] = v;
    },
    async deleteEntry(id) {
      ctx.s.log.delete(id);
    },
    async deleteEntries(ids) {
      for (const id of ids) ctx.s.log.delete(id);
    },
    // ts in [from, to), oldest first (ts, then createdAt).
    async heldEntries(type, from, to) {
      return [...ctx.s.log.values()].filter((r) => r.type === type && r.ts >= from && r.ts < to).sort((a, b) => a.ts - b.ts || a.createdAt - b.createdAt).map((r) => structuredClone(r));
    },
  });

  const repos: Repos = {
    daily,
    sessions,
    samples,
    scores,
    settings,
    log,
    series: partial("series", {}),
    journal: partial("journal", {}),
    profile: partial("profile", {}),
    coach: partial("coach", {}),
  };

  // Transactions never overlap (a second waits); a rejection rolls every write back.
  let queue: Promise<unknown> = Promise.resolve();
  const transaction: Store["transaction"] = (fn) => {
    const run = queue.then(async () => {
      const before = structuredClone(ctx.s);
      try {
        return await fn(repos);
      } catch (err) {
        ctx.s = before;
        throw err;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  return { ...repos, transaction };
}
