// Pulse's stored rows for a window of days as one webhook body in the shape the server reads (pulse
// src/server/sources/healthConnect/parse.ts; Life Dashboard Companion's docs/webhook.md): ISO instants, one record per
// sample with a stable `uuid` so a re-sent window lands on itself, and the window declared as a complete backfill, so
// a night or workout the phone no longer has is pruned there too. Pure: no I/O, no clock.
import type { DailyValue, Exercise, HrSample, HrvSample, Metrics, Segment, Session, StepsMinute } from "@/data/types";
import { addDays, localMidnight } from "@/lib/time";

export const SOURCE = "pulse-mobile";

export type PushRows = {
  hr: HrSample[];
  steps: StepsMinute[];
  hrv: HrvSample[];
  sessions: Session[];
  segments: Segment[];
  exercises: Exercise[];
  metrics: Metrics[];
  dailyValues: DailyValue[];
  /** daily_values "latest"/"height_cm", when known. */
  heightCm: number | null;
};

export type PayloadOptions = {
  /** First and last local day of the window, inclusive. */
  from: string;
  to: string;
  timeZone: string;
  sequence: number;
  /** Unix seconds. */
  now: number;
  appVersion: string;
};

const iso = (s: number) => new Date(s * 1000).toISOString();
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The instant a day's nightly reading is stamped with: the middle of its main sleep, else 03:00 local. */
function nightInstant(day: string, sessions: Session[], tz: string): number {
  const main = sessions.find((s) => s.day === day && s.isMain) ?? sessions.find((s) => s.day === day);
  return main ? Math.floor((main.startTs + main.endTs) / 2) : localMidnight(day, tz) + 3 * 3600;
}

/** Builds the body for the window. The server takes `uuid` as is; `#` separates a sample from its record. */
export function buildPayload(rows: PushRows, o: PayloadOptions): Record<string, unknown> {
  const tz = o.timeZone;
  const windowStart = localMidnight(o.from, tz);
  const windowEnd = localMidnight(addDays(o.to, 1), tz);
  const noon = (day: string) => localMidnight(day, tz) + 12 * 3600;
  const body: Record<string, unknown> = {
    test: false,
    source: "health_connect",
    timestamp: iso(o.now),
    sequence: o.sequence,
    app_version: `${SOURCE}/${o.appVersion}`,
    timezone: tz,
    backfill: true,
    window_start: iso(windowStart),
    window_end: iso(windowEnd),
    window_complete: true,
  };

  const heart_rate = rows.hr.map((s) => ({ uuid: `heart_rate#${s.ts * 1000}`, source: SOURCE, time: iso(s.ts), bpm: Math.round(s.bpm) }));
  if (heart_rate.length) body.heart_rate = heart_rate;

  const steps = rows.steps.filter((m) => m.v > 0).map((m) => ({ uuid: `steps-${m.ts}`, source: SOURCE, start_time: iso(m.ts), end_time: iso(m.ts + 60), count: Math.round(m.v) }));
  if (steps.length) body.steps = steps;

  const segs = new Map<string, Segment[]>();
  for (const g of rows.segments) segs.set(g.sessionId, [...(segs.get(g.sessionId) ?? []), g]);
  const sleep = rows.sessions.map((s) => ({
    uuid: s.id,
    source: SOURCE,
    session_end_time: iso(s.endTs),
    duration_seconds: s.endTs - s.startTs,
    stages: (segs.get(s.id) ?? []).sort((a, b) => a.startTs - b.startTs).map((g) => ({ stage: g.stage, start_time: iso(g.startTs), end_time: iso(g.endTs) })),
  }));
  if (sleep.length) body.sleep = sleep;

  // The server upper-cases `name` into the exercise type and keeps `title` as the name.
  const exercise = rows.exercises.map((e) => ({ uuid: e.id, source: SOURCE, start_time: iso(e.startTs), end_time: iso(e.endTs), type: "0", name: e.type.toLowerCase(), title: e.name }));
  if (exercise.length) body.exercise = exercise;

  const hrv = rows.hrv.map((h) => ({ uuid: `hrv#${h.ts * 1000}`, source: SOURCE, time: iso(h.ts), heart_rate_variability_millis: r1(h.ms) }));
  if (hrv.length) body.heart_rate_variability = hrv;

  const rhr: unknown[] = [];
  const resp: unknown[] = [];
  const spo2: unknown[] = [];
  const skin: unknown[] = [];
  const weight: unknown[] = [];
  const fat: unknown[] = [];
  const vo2: unknown[] = [];
  const totals: unknown[] = [];
  const extra = new Map<string, Map<string, number>>();
  for (const v of rows.dailyValues) {
    if (v.day === "latest") continue;
    extra.set(v.day, (extra.get(v.day) ?? new Map()).set(v.key, v.value));
  }
  const days = new Set<string>([...rows.metrics.map((m) => m.day), ...extra.keys()]);
  for (const day of [...days].sort()) {
    if (day < o.from || day > o.to) continue;
    const m = rows.metrics.find((x) => x.day === day);
    const night = nightInstant(day, rows.sessions, tz);
    if (m?.rhrBpm != null) rhr.push({ uuid: `rhr-${day}`, source: SOURCE, time: iso(noon(day)), bpm: Math.round(m.rhrBpm) });
    if (m?.respBpm != null) resp.push({ uuid: `resp-${day}`, source: SOURCE, time: iso(night), rate: r1(m.respBpm) });
    if (m?.spo2Pct != null) spo2.push({ uuid: `spo2-${day}`, source: SOURCE, time: iso(night), percentage: r1(m.spo2Pct) });
    if (m?.nightlyTempC != null) {
      const baseline = m.tempBaselineC ?? 0;
      skin.push({ uuid: `skin_temperature#${night * 1000}`, source: SOURCE, time: iso(night), delta_celsius: Math.round((m.nightlyTempC - baseline) * 100) / 100, ...(baseline ? { baseline_celsius: baseline } : {}) });
    }
    if (m?.weightKg != null) weight.push({ uuid: `weight-${day}`, source: SOURCE, time: iso(noon(day)), kilograms: r1(m.weightKg) });
    if (m?.bodyFatPct != null) fat.push({ uuid: `body_fat-${day}`, source: SOURCE, time: iso(noon(day)), percentage: r1(m.bodyFatPct) });
    const vo2max = m?.vo2maxRun ?? m?.vo2maxDaily;
    if (vo2max != null) vo2.push({ uuid: `vo2_max-${day}`, source: SOURCE, time: iso(noon(day)), vo2_ml_per_min_per_kg: r1(vo2max) });
    const x = extra.get(day);
    const total = {
      date: day,
      ...(m?.steps != null && { steps: Math.round(m.steps) }),
      ...(m?.calories != null && { total_calories: Math.round(m.calories) }),
      ...(x?.get("distance_m") != null && { distance_meters: Math.round(x.get("distance_m")!) }),
      ...(x?.get("active_calories") != null && { active_calories: Math.round(x.get("active_calories")!) }),
    };
    if (Object.keys(total).length > 1) totals.push(total);
  }
  if (rhr.length) body.resting_heart_rate = rhr;
  if (resp.length) body.respiratory_rate = resp;
  if (spo2.length) body.oxygen_saturation = spo2;
  if (skin.length) body.skin_temperature = skin;
  if (weight.length) body.weight = weight;
  if (fat.length) body.body_fat = fat;
  if (vo2.length) body.vo2_max = vo2;
  if (totals.length) body.daily_totals = totals;
  if (rows.heightCm != null && rows.heightCm > 0) body.height = [{ uuid: "height-latest", source: SOURCE, time: iso(o.now), meters: Math.round(rows.heightCm * 10) / 1000 }];
  return body;
}

/** The test ping the server answers 204 to (pairing). */
export const testPayload = (now: number, appVersion: string, tz: string): Record<string, unknown> => ({
  test: true,
  source: "health_connect",
  timestamp: iso(now),
  app_version: `${SOURCE}/${appVersion}`,
  timezone: tz,
});

/** `[from, to]` cut into windows of at most `size` days, oldest first. */
export function windows(from: string, to: string, size: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let d = from; d <= to; d = addDays(d, size)) {
    const end = addDays(d, size - 1);
    out.push({ from: d, to: end < to ? end : to });
  }
  return out;
}

/** Whether the body holds anything beyond its envelope. */
export const isEmptyPayload = (body: Record<string, unknown>): boolean =>
  !Object.keys(body).some((k) => !["test", "source", "timestamp", "sequence", "app_version", "timezone", "backfill", "window_start", "window_end", "window_complete"].includes(k));
