import { describe, expect, it } from "vitest";
import { scoreHashes } from "./canonical";
import { loadF1, loadF2, loadF3, loadF4, loadF5, loadF6 } from "./fixtures";

// GOLDEN[10], copied literally from pulse's src/server/pipeline/golden.test.ts (the `10:` entry of GOLDEN, lines
// 159-181 at pulse e43e85a): the fingerprints of the pinned 180-day demo database at SCORING_VERSION 10.
const GOLDEN_10 = {
  "daily_scores.scoring_version": "bfc634c893f9c22c",
  "daily_scores.strain": "cae5fec2cbcf2efd",
  "daily_scores.activities": "cb2d75373aaf4d20",
  "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
  "daily_scores.recovery": "f30d80524db0f63f",
  "daily_scores.sleep": "ccb090c5c5766471",
  "daily_scores.training_load": "c6a22d117dfa06bc",
  "daily_scores.strain_target": "bfcfd859e9c7dd75",
  "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
  "daily_scores.energy_bank": "f822e67fed343673",
  "daily_scores.stress": "a8514c3f8bedce98",
  "daily_scores.health_monitor": "3a2163c7f92d4dab",
  "daily_scores.healthspan": "b7ad7077ab11d111",
  "daily_scores.fitness": "cfad8d1954c878ed",
  "daily_scores.journal_impact": "7eed29fa9baca1ea",
  "intraday_series.energy_bank": "237320b091a7a358",
  "intraday_series.hr": "5ca83bb68dad9033",
  "intraday_series.load": "859d8876596ad379",
  "intraday_series.still_hr": "c0bf14266ee71abd",
  "intraday_series.stress": "66d650df74998208",
  "reports": "7c7cfdf8c1583777",
};

describe("parity fixtures", () => {
  it("F3's rows hash to pulse's pinned GOLDEN[10]", () => {
    const f3 = loadF3();
    expect(scoreHashes(f3)).toEqual(GOLDEN_10);
    expect(f3.hashes).toEqual(GOLDEN_10);
  });

  it("F4's rows hash to the hashes it records", () => {
    const f4 = loadF4();
    expect(scoreHashes(f4)).toEqual(f4.hashes);
  });

  it("every fixture is from SCORING_VERSION 10", () => {
    for (const f of [loadF1(), loadF2(), loadF3(), loadF4(), loadF5(), loadF6()]) expect(f.scoringVersion).toBe(10);
  });
});
