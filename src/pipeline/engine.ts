// Stage 2's Pulse engine scorers (docs/engine-plan.md), next to halo's in scores.ts: the Sleep Score, Sleep Bank,
// Consistency and Need, and Recovery, from the per-day aggregates stage 1 keeps (Stage1Day.engine) and the 60-day
// pooled baselines over the days before. They fill the same daily_scores rows the screens read, so the screens keep
// their look. Every value for day D reads only D and earlier days.
import type { ReasonCode } from "@/lib/reasons";
import { addDays, daysBetween, localMinutes } from "@/lib/time";
import { type SleepPlan, sleepPlan } from "@/core/algorithms/sleepPlanner";
import type { ChargeDriver, ChargeDriverVerdict } from "@/core/scoring/drivers";
import { type Agg, baseline, calibrated, RECOVERY_CALIBRATION_DAYS } from "@/core/engine/baselines";
import { DEFAULT_SLEEP_GOAL_HOURS, POOLING } from "@/core/engine/days";
import { mean, roundHalfAway } from "@/core/engine/math";
import { recovery, type RecoveryResult } from "@/core/engine/recovery";
import {
  hasStages,
  hrDip,
  type SleepComponent,
  sleepBank,
  sleepConsistency,
  type SleepNeed,
  sleepNeeded,
  sleepScore,
  type SleepSeg,
  stageSums,
  tonightNeeded,
} from "@/core/engine/sleep";
import type { Day, Fold, Inputs, scorePlanner } from "./scores";
import type { BaselineSummary, CardioLoadRow, PipelineOptions, RecoveryRow, SleepPlannerRow, SleepRow, StrainTargetRow } from "./types";
import { loadConfidence, loadStatus, loadStep, targetBase, targetRange } from "@/core/engine/strain";
import { band } from "@/core/scoring/recovery";

/** Aggregates kept per day for the baselines (oldest first, at most BASELINE_DAYS). */
type DayAggRow = { restingHRV: Agg | null; restingHR: Agg | null; inactiveHR: Agg | null; resp: Agg | null; temp: Agg | null };

/** The engine's part of the stage-2 fold: plain arrays (the checkpoint clones it), bounded in length. */
export const newEngineFold = () => ({
  aggs: [] as DayAggRow[],
  /** Seconds asleep (main sleep and naps) per day, the last 7, for the bank. */
  asleepS: [] as number[],
  /** Strain per day, the last 30, for the need's strain term. */
  strains: [] as number[],
  prevStrain: null as number | null,
  /** The last 8 days' primary sleep: its day bounds and asleep spans, for Consistency. */
  nights: [] as { dayStart: number; dayEnd: number; spans: [number, number][] | null }[],
  /** The last 30 nights' efficiency (%) and minutes to fall asleep, for tonight's need. */
  effs: [] as number[],
  lats: [] as number[],
  /** Sleep Scores of the last 60 days, the Sleep row's "typical night" in the drivers. */
  sleepScores: [] as number[],
  /** Day numbers with a Recovery (the calibration span), first and count. */
  recoveryFirst: null as number | null,
  recoveryDays: 0,
  /** Cardio Load: ATL and CTL, the last 28 daily loads, whether each of the last 42 was active, the last 10 CTLs. */
  atl: 0,
  ctl: 0,
  loads28: [] as number[],
  active42: [] as boolean[],
  ctls: [] as number[],
  /** Daily Strain of the last 15 days (null without one), Target Strain's history. */
  strainHist: [] as (number | null)[],
});

const push = <T>(xs: T[], x: T, max: number) => {
  xs.push(x);
  if (xs.length > max) xs.splice(0, xs.length - max);
};

const goalHours = () => DEFAULT_SLEEP_GOAL_HOURS;

/** The primary sleep's stage segments; a night without stages is unstaged sleep over its asleep minutes. */
function mainSegments(d: Day, inputs: Inputs): { segs: SleepSeg[]; staged: boolean } {
  const s = d.mainSession;
  if (!s) return { segs: [], staged: false };
  const staged = (inputs.segments.get(s.id) ?? []).slice().sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
  if (s.stagesStatus === "SUCCEEDED" && staged.length && hasStages(staged)) return { segs: staged, staged: true };
  const asleepS = s.asleepMin != null ? s.asleepMin * 60 : s.endTs - s.startTs;
  return { segs: [{ startTs: s.startTs, endTs: s.startTs + asleepS, stage: "unspecified" }], staged: false };
}

export type EngineSleep = {
  score: number | null;
  components: Record<SleepComponent, number | null>;
  need: SleepNeed;
  bankMin: number;
  consistency: number | null;
  sleepingHr: number | null;
  /** Seconds asleep today (main sleep and naps), and the main sleep's asleep spans, for the fold. */
  asleepS: number;
  spans: [number, number][] | null;
};

/** The Sleep family for day D: score, need, bank and consistency. */
export function scoreEngineSleep(f: Fold, d: Day, inputs: Inputs, opts: PipelineOptions, tz: string): EngineSleep {
  const e = f.engine;
  const goal = goalHours();
  const previousBank = sleepBank(e.asleepS, goal);
  const need = sleepNeeded(goal, e.prevStrain, e.strains, previousBank);
  const { segs, staged } = mainSegments(d, inputs);
  const sums = stageSums(segs);
  const sleepingHr = d.s1.engine?.restingHR?.avg ?? null;
  const inactiveBase = baseline(e.aggs.map((a) => a.inactiveHR), POOLING.inactiveHR);
  const r = d.mainSession
    ? sleepScore({ sums, staged, needS: need.needS, hrDip: hrDip(sleepingHr, inactiveBase?.avg ?? null), age: d.age.whole, sex: opts.profile.sex })
    : null;
  const asleepToday = sums.asleep + d.naps.reduce((a, n) => a + n.asleepMin * 60, 0);
  const bankMin = sleepBank([...e.asleepS, asleepToday], goal);

  // Consistency: the up-to-7 most recent days (D included) with a primary sleep, each painted with its own night and
  // the night of the included day before it, as local clock minutes.
  const spans: [number, number][] | null = d.mainSession ? segs.filter((g) => g.stage !== "awake").map((g) => [g.startTs, g.endTs]) : null;
  const nights = [...e.nights, { dayStart: d.start, dayEnd: d.end, spans }].slice(-8);
  const withSleep = nights.slice(1).filter((n) => n.spans);
  const anchor = nights[0].spans ? nights[0] : null;
  const paint = (n: (typeof nights)[number], from: (typeof nights)[number] | null): [number, number][] =>
    [...(from?.spans ?? []), ...n.spans!].flatMap(([s, t]): [number, number][] => {
      const a = Math.max(s, n.dayStart);
      const b = Math.min(t, n.dayEnd);
      if (!(a < b)) return [];
      const m0 = localMinutes(a - (a % 60), tz);
      const m1 = b === n.dayEnd ? 1440 : localMinutes(b - (b % 60), tz);
      return m1 > m0 ? [[m0, m1]] : [];
    });
  const consistency = sleepConsistency(withSleep.map((n, i) => paint(n, i === 0 ? anchor : withSleep[i - 1])));

  const comp = (k: SleepComponent) => r?.components[k]?.input ?? null;
  return {
    score: r?.score ?? null,
    components: { asleep: comp("asleep"), deep: comp("deep"), rem: comp("rem"), hrDip: comp("hrDip"), efficiency: comp("efficiency"), continuity: comp("continuity") },
    need,
    bankMin,
    consistency,
    sleepingHr,
    asleepS: asleepToday,
    spans,
  };
}

/** The Sleep row with the engine's values in place of halo's: score, need, bank (as debt) and consistency. */
export function engineSleepRow(row: SleepRow, s: EngineSleep): SleepRow {
  const r2 = (x: number | null) => (x == null ? null : roundHalfAway(x, 2));
  return {
    ...row,
    performance: s.score == null ? null : roundHalfAway(s.score, 1),
    reason: row.reason ?? (s.score == null && row.main ? "no_data" : null),
    parts: null,
    components: Object.fromEntries(Object.entries(s.components).map(([k, v]) => [k, r2(v)])) as EngineSleep["components"],
    needHours: goalHours(),
    needMin: roundHalfAway(s.need.needS / 60, 1),
    debtMin: roundHalfAway(Math.max(0, -s.bankMin), 1),
    bankMin: roundHalfAway(s.bankMin, 1),
    consistency: s.consistency == null ? null : roundHalfAway(s.consistency, 1),
  };
}

const summary = (b: Agg | null, ok: boolean): BaselineSummary =>
  b && { mean: roundHalfAway(b.avg, 2), sd: roundHalfAway(b.sd, 3), status: ok ? "trusted" : "provisional", nValid: b.count };

/** Recovery for day D, on the shape halo's RecoveryRow has. */
export function scoreEngineRecovery(f: Fold, d: Day, sleep: EngineSleep): RecoveryRow {
  const e = f.engine;
  const a = d.s1.engine;
  const pool = (k: keyof DayAggRow) => baseline(e.aggs.map((x) => x[k]), POOLING[k]);
  const base = { hrv: pool("restingHRV"), rhr: pool("restingHR"), resp: pool("resp"), temp: pool("temp") };
  const hrv = a?.restingHRV?.avg ?? null;
  const rhr = a?.restingHR?.avg ?? null;
  const resp = d.dm?.respBpm ?? null;
  const temp = tempDelta(d);
  const r = recovery({ hrv, hrvBase: base.hrv, rhr, rhrBase: base.rhr, sleepScore: sleep.score, resp, respBase: base.resp, temp, tempBase: base.temp });
  const today = daysBetween("1970-01-01", d.day);
  const first = e.recoveryFirst ?? today;
  const ok = r.value != null && calibrated(first, today, e.recoveryDays + 1, RECOVERY_CALIBRATION_DAYS);
  let reason: ReasonCode | null = null;
  let nightsLeft: number | undefined;
  if (r.value == null) {
    if (!d.mainSession) reason = "band_not_worn";
    else if (!d.mainSession.processed) reason = "awaiting_sleep_sync";
    else if (r.missing.includes("hrv")) reason = "no_hrv_last_night";
    else if (r.missing.includes("hrvBaseline") || r.missing.includes("rhrBaseline")) {
      reason = "calibrating";
      nightsLeft = 1;
    } else reason = "no_data";
  } else {
    if (e.recoveryFirst == null) e.recoveryFirst = today;
    e.recoveryDays++;
    f.recoveries.push(r.value);
  }
  const value = r.value == null ? null : roundHalfAway(r.value, 1);
  const terms = r.value == null ? [] : ["hrv", "rhr", "sleep", ...(resp != null && base.resp ? ["resp"] : []), ...(temp != null && base.temp ? ["skinTemp"] : [])];
  const prev = d.cache.recovery;
  return {
    value,
    reason,
    ...(nightsLeft !== undefined && { nightsLeft }),
    provisional: value != null && !ok,
    stale: [],
    terms,
    updated: value != null && prev?.value != null && (prev.updated || terms.some((t) => !prev.terms.includes(t))),
    inputs: {
      hrv: hrv == null ? null : roundHalfAway(hrv, 1),
      rhr: rhr == null ? null : roundHalfAway(rhr, 1),
      resp,
      sleepPerf: sleep.score == null ? null : roundHalfAway(sleep.score / 100, 3),
      skinTempDev: temp == null ? null : roundHalfAway(temp, 2),
    },
    baselines: { hrv: summary(base.hrv, ok), rhr: summary(base.rhr, ok), resp: summary(base.resp, ok), skinTemp: summary(base.temp, ok) },
    hrvZ: hrv != null && base.hrv && base.hrv.sd > 0 ? roundHalfAway((hrv - base.hrv.avg) / base.hrv.sd, 2) : null,
    drivers: r.value == null ? [] : drivers(r, { hrv, rhr, resp, temp, sleep: sleep.score }, base, mean(e.sleepScores)),
    forecast: null,
    forecastNightsLeft: Math.max(0, 14 - f.recoveries.length),
  };
}

/** Last night's skin-temperature delta, °C: Health Connect's nightly reading against its own baseline (fix 10). */
const tempDelta = (d: Day) => (d.dm?.nightlyTempC == null ? null : d.dm.nightlyTempC - (d.dm.tempBaselineC ?? 0));

/**
 * "What shaped it": each term's points against that term at its baseline (HRV, resting HR and respiratory rate at z = 0,
 * temperature at or below baseline, the Sleep Score at the person's typical night), biggest mover first.
 */
function drivers(
  r: Extract<RecoveryResult, { value: number }>,
  cur: { hrv: number | null; rhr: number | null; resp: number | null; temp: number | null; sleep: number | null },
  base: { hrv: Agg | null; rhr: Agg | null; resp: Agg | null; temp: Agg | null },
  typicalSleep: number | null,
): ChargeDriver[] {
  const verdict = (pts: number, above: boolean): ChargeDriverVerdict => {
    const dir = above ? "ABOVE" : "BELOW";
    if (Math.abs(pts) < 1) return "AT_BASELINE";
    const kind = pts > 0 ? "SUPPORTING" : "LIMITING";
    return (Math.abs(pts) < 3 ? `SLIGHTLY_${dir}_BASELINE_${kind}` : `${dir}_BASELINE_${kind}`) as ChargeDriverVerdict;
  };
  const pts = (x: number) => roundHalfAway(x);
  const out: ChargeDriver[] = [];
  if (cur.hrv != null && base.hrv) {
    const p = pts((r.parts.hrv - 50) * 0.4);
    out.push({ label: "HEART_RATE_VARIABILITY", deltaPoints: p, value: roundHalfAway(cur.hrv, 1), baseline: roundHalfAway(base.hrv.avg, 1), unit: "MILLISECONDS", verdict: verdict(p, cur.hrv > base.hrv.avg) });
  }
  if (cur.rhr != null && base.rhr) {
    const p = pts((r.parts.rhr - 50) * 0.3);
    out.push({ label: "RESTING_HEART_RATE", deltaPoints: p, value: roundHalfAway(cur.rhr, 1), baseline: roundHalfAway(base.rhr.avg, 1), unit: "BEATS_PER_MINUTE", verdict: verdict(p, cur.rhr > base.rhr.avg) });
  }
  if (cur.sleep != null) {
    const p = pts((cur.sleep - (typicalSleep ?? cur.sleep)) * 0.3);
    const v: ChargeDriverVerdict = p >= 3 ? "STRONG_NIGHT_SUPPORTING" : p <= -3 ? "BELOW_GOOD_NIGHT_LIMITING" : "TYPICAL_NIGHT";
    out.push({ label: "SLEEP_QUALITY", deltaPoints: p, value: roundHalfAway(cur.sleep), baseline: null, unit: "PERCENT", verdict: v });
  }
  if (cur.resp != null && base.resp && r.parts.resp !== 0) {
    const p = pts(r.parts.resp);
    out.push({ label: "RESPIRATORY_RATE", deltaPoints: p, value: cur.resp, baseline: roundHalfAway(base.resp.avg, 1), unit: "BREATHS_PER_MINUTE", verdict: verdict(p, cur.resp > base.resp.avg) });
  }
  if (cur.temp != null && base.temp && r.parts.temp < 0) {
    const p = pts(r.parts.temp);
    out.push({ label: "SKIN_TEMPERATURE", deltaPoints: p, value: roundHalfAway(cur.temp, 2), baseline: roundHalfAway(base.temp.avg, 2), unit: "CELSIUS_DEVIATION", verdict: p === 0 ? "NEAR_BASELINE" : "WARMER_THAN_BASELINE_LIMITING" });
  }
  return out.sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints));
}

/** Tonight's need from the engine (sleep.md § Tonight planner), in the planner's parts. */
export function engineTonight(f: Fold, s: EngineSleep, strainToday: number | null) {
  const e = f.engine;
  const strains = strainToday == null ? e.strains : [...e.strains, strainToday].slice(-30);
  const need = sleepNeeded(goalHours(), strainToday, strains, s.bankMin);
  return tonightNeeded(need, e.effs, e.lats);
}

/** Folds day D into the engine's state, after every scorer has read it. */
export function foldEngineDay(f: Fold, d: Day, s: EngineSleep, strain: number | null) {
  const e = f.engine;
  const a = d.s1.engine;
  const temp = tempDelta(d);
  push(e.aggs, {
    restingHRV: a?.restingHRV ?? null,
    restingHR: a?.restingHR ?? null,
    inactiveHR: a?.inactiveHR ?? null,
    resp: d.dm?.respBpm == null ? null : { avg: d.dm.respBpm, sd: 0, count: 1 },
    temp: temp == null ? null : { avg: temp, sd: 0, count: 1 },
  }, 60);
  push(e.asleepS, s.asleepS, 7);
  if (strain != null) push(e.strains, strain, 30);
  e.prevStrain = strain;
  push(e.nights, { dayStart: d.start, dayEnd: d.end, spans: s.spans }, 8);
  if (d.main) {
    push(e.effs, d.main.efficiency * 100, 30);
    if (d.main.latencyMin != null) push(e.lats, d.main.latencyMin, 30);
  }
  if (s.score != null) push(e.sleepScores, s.score, 60);
  push(e.strainHist, strain, 15);
}

/**
 * Tonight's plan on the engine's need (goal, strain and a quarter of the debt; naps count through the bank): halo's
 * planner turns it into bedtimes through the usual efficiency and time to fall asleep, and its parts become the engine's.
 */
export function enginePlan(f: Fold, d: Day, s: EngineSleep, planner: ReturnType<typeof scorePlanner>, strainToday: number | null) {
  const t = engineTonight(f, s, strainToday);
  const wakeDay = addDays(d.day, 1);
  const plan: SleepPlan = {
    ...sleepPlan({ baselineNeedHours: t.needS / 3600, strain: null, debtMin: 0, napMin: 0, nights: f.wakeNights, wakeDay }),
    parts: { baselineMin: t.goalS / 60, strainMin: t.strainS / 60, debtMin: t.debtS / 60, napMin: 0 },
  };
  f.prevPlan = { wakeDay, needMin: plan.needMin };
  const row: SleepPlannerRow = planner.row.reason === null ? { ...planner.row, ...plan } : { ...planner.row, needMin: plan.needMin };
  return { ...planner, row, plan };
}

/** Day D's Daily Strain on the engine (a percent), or null without one. */
export const engineStrain = (d: Day): number | null => d.s1.engine?.strain?.value ?? null;

/**
 * Cardio Load for day D (strain-load.md § Cardio Load): the day's load is its workouts' TRIMP, ATL and CTL step from a
 * zero seed, and the status reads the same day's Recovery.
 */
export function scoreCardioLoad(f: Fold, d: Day, recoveryValue: number | null): CardioLoadRow {
  const e = f.engine;
  const load = d.cache.activities.reduce((a, x) => a + (x.engine?.trimp ?? 0), 0);
  push(e.loads28, load, 28);
  push(e.active42, load > 5, 42);
  const { atl, ctl } = loadStep(e, load);
  e.atl = atl;
  e.ctl = ctl;
  push(e.ctls, ctl, 10);
  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
  const a = meanOf(e.ctls.slice(-5));
  const b = e.ctls.length > 5 ? meanOf(e.ctls.slice(0, -5)) : null;
  const ctlTrendPct = a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null;
  const confidence = loadConfidence(e.loads28, e.active42.filter(Boolean).length);
  const r4 = (x: number) => roundHalfAway(x, 4);
  return {
    load: r4(load),
    atl: r4(atl),
    ctl: r4(ctl),
    ratio: ctl > 0 ? r4(atl / ctl) : null,
    confidence: r4(confidence),
    status: loadStatus({ atl, ctl, confidence, ctlTrendPct, recovery: recoveryValue }),
  };
}

/**
 * Target Strain for day D (strain-load.md § Target Strain): the 14 days before, folded, scaled by today's Recovery. On
 * the percent scale; always present (a short history folds what there is).
 */
export function scoreEngineStrainTarget(f: Fold, recoveryValue: number | null): StrainTargetRow {
  const hist = f.engine.strainHist;
  const base = targetBase(hist);
  const { low, high } = targetRange(base, recoveryValue);
  return {
    reason: null,
    low: roundHalfAway(low, 1),
    high: roundHalfAway(high, 1),
    base: hist.length ? roundHalfAway(base, 1) : null,
    band: band(recoveryValue ?? 50),
    coldStart: hist.length < 14,
    acwrRule: null,
  };
}
