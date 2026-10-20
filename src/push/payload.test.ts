import { describe, expect, it } from "vitest";
import { emptyMetrics } from "@/data/types";
import { buildPayload, isEmptyPayload, testPayload, windows, type PushRows } from "./payload";

const TZ = "UTC";
const day = "2026-10-05";
const mid = Date.parse(`${day}T00:00:00Z`) / 1000;
const empty: PushRows = { hr: [], steps: [], hrv: [], sessions: [], segments: [], exercises: [], metrics: [], dailyValues: [], heightCm: null };
const opts = { from: day, to: day, timeZone: TZ, sequence: 7, now: mid + 15 * 3600, appVersion: "0.3.0" };

describe("buildPayload", () => {
  it("declares the window as a complete backfill with the envelope the server reads", () => {
    const b = buildPayload(empty, opts);
    expect(b).toMatchObject({ test: false, source: "health_connect", sequence: 7, app_version: "pulse-mobile/0.3.0", timezone: TZ, backfill: true, window_complete: true });
    expect(b.window_start).toBe("2026-10-05T00:00:00.000Z");
    expect(b.window_end).toBe("2026-10-06T00:00:00.000Z");
    expect(isEmptyPayload(b)).toBe(true);
  });

  it("maps samples, steps, a staged night, a workout and the day's vitals to the companion app's shapes", () => {
    const rows: PushRows = {
      ...empty,
      hr: [{ ts: mid + 3600, bpm: 61.4 }],
      steps: [
        { ts: mid + 7200, v: 12 },
        { ts: mid + 7260, v: 0 },
      ],
      hrv: [{ ts: mid + 3 * 3600, ms: 48.26 }],
      sessions: [{ id: "hc-sleep-1", day, startTs: mid - 2 * 3600, endTs: mid + 6 * 3600, isMain: true, processed: true, stagesStatus: "SUCCEEDED", asleepMin: 420, awakeMin: 60, deepMin: 90, lightMin: 240, remMin: 90 }],
      segments: [
        { sessionId: "hc-sleep-1", startTs: mid + 1800, endTs: mid + 3600, stage: "deep" },
        { sessionId: "hc-sleep-1", startTs: mid - 2 * 3600, endTs: mid + 1800, stage: "light" },
      ],
      exercises: [{ id: "hc-ex-1", day, startTs: mid + 10 * 3600, endTs: mid + 11 * 3600, type: "RUNNING", name: "Morning run", calories: 500, distanceM: 8000 }],
      metrics: [{ ...emptyMetrics(day), hrvMs: 48.3, rhrBpm: 55, respBpm: 14.25, spo2Pct: 96.44, nightlyTempC: 33.4, tempBaselineC: 33.1, weightKg: 78.6, bodyFatPct: 21.5, vo2maxDaily: 44, steps: 9000, calories: 2400 }],
      dailyValues: [
        { day, key: "distance_m", value: 6500.4 },
        { day, key: "active_calories", value: 600 },
        { day: "latest", key: "height_cm", value: 178 },
      ],
      heightCm: 178,
    };
    const b = buildPayload(rows, opts) as Record<string, unknown[]>;
    expect(b.heart_rate).toEqual([{ uuid: `heart_rate#${(mid + 3600) * 1000}`, source: "pulse-mobile", time: "2026-10-05T01:00:00.000Z", bpm: 61 }]);
    // A minute without steps is not sent.
    expect(b.steps).toEqual([{ uuid: `steps-${mid + 7200}`, source: "pulse-mobile", start_time: "2026-10-05T02:00:00.000Z", end_time: "2026-10-05T02:01:00.000Z", count: 12 }]);
    expect(b.heart_rate_variability).toEqual([{ uuid: `hrv#${(mid + 3 * 3600) * 1000}`, source: "pulse-mobile", time: "2026-10-05T03:00:00.000Z", heart_rate_variability_millis: 48.3 }]);
    const sleep = b.sleep[0] as { uuid: string; session_end_time: string; duration_seconds: number; stages: { stage: string }[] };
    expect(sleep).toMatchObject({ uuid: "hc-sleep-1", session_end_time: "2026-10-05T06:00:00.000Z", duration_seconds: 8 * 3600 });
    expect(sleep.stages.map((s) => s.stage)).toEqual(["light", "deep"]);
    expect(b.exercise).toEqual([{ uuid: "hc-ex-1", source: "pulse-mobile", start_time: "2026-10-05T10:00:00.000Z", end_time: "2026-10-05T11:00:00.000Z", type: "0", name: "running", title: "Morning run" }]);
    // Nightly vitals sit in the middle of the main sleep; the day's values at noon.
    const night = "2026-10-05T02:00:00.000Z";
    expect(b.respiratory_rate).toEqual([{ uuid: `resp-${day}`, source: "pulse-mobile", time: night, rate: 14.3 }]);
    expect(b.oxygen_saturation).toEqual([{ uuid: `spo2-${day}`, source: "pulse-mobile", time: night, percentage: 96.4 }]);
    expect(b.skin_temperature).toEqual([{ uuid: `skin_temperature#${(mid + 2 * 3600) * 1000}`, source: "pulse-mobile", time: night, delta_celsius: 0.3, baseline_celsius: 33.1 }]);
    expect(b.resting_heart_rate).toEqual([{ uuid: `rhr-${day}`, source: "pulse-mobile", time: "2026-10-05T12:00:00.000Z", bpm: 55 }]);
    expect(b.weight).toEqual([{ uuid: `weight-${day}`, source: "pulse-mobile", time: "2026-10-05T12:00:00.000Z", kilograms: 78.6 }]);
    expect(b.body_fat).toEqual([{ uuid: `body_fat-${day}`, source: "pulse-mobile", time: "2026-10-05T12:00:00.000Z", percentage: 21.5 }]);
    expect(b.vo2_max).toEqual([{ uuid: `vo2_max-${day}`, source: "pulse-mobile", time: "2026-10-05T12:00:00.000Z", vo2_ml_per_min_per_kg: 44 }]);
    expect(b.daily_totals).toEqual([{ date: day, steps: 9000, total_calories: 2400, distance_meters: 6500, active_calories: 600 }]);
    expect(b.height).toEqual([{ uuid: "height-latest", source: "pulse-mobile", time: new Date(opts.now * 1000).toISOString(), meters: 1.78 }]);
    expect(isEmptyPayload(b)).toBe(false);
  });

  it("a skin temperature without a baseline is sent as a delta only; a night without a main sleep is stamped at 03:00", () => {
    const b = buildPayload({ ...empty, metrics: [{ ...emptyMetrics(day), nightlyTempC: 0.4, tempBaselineC: 0 }] }, opts) as Record<string, unknown[]>;
    expect(b.skin_temperature).toEqual([{ uuid: `skin_temperature#${(mid + 3 * 3600) * 1000}`, source: "pulse-mobile", time: "2026-10-05T03:00:00.000Z", delta_celsius: 0.4 }]);
  });

  it("leaves out metrics outside the window", () => {
    const b = buildPayload({ ...empty, metrics: [{ ...emptyMetrics("2026-10-04"), rhrBpm: 50 }] }, opts);
    expect(b.resting_heart_rate).toBeUndefined();
  });

  it("the ping is a test envelope", () => expect(testPayload(mid, "0.3.0", TZ)).toMatchObject({ test: true, source: "health_connect", app_version: "pulse-mobile/0.3.0" }));

  it("cuts a range into windows", () => {
    expect(windows("2026-10-01", "2026-10-17", 7)).toEqual([
      { from: "2026-10-01", to: "2026-10-07" },
      { from: "2026-10-08", to: "2026-10-14" },
      { from: "2026-10-15", to: "2026-10-17" },
    ]);
    expect(windows("2026-10-01", "2026-10-01", 7)).toEqual([{ from: "2026-10-01", to: "2026-10-01" }]);
  });
});
