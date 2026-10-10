import { describe, expect, it } from "vitest";
import { scoreHashes } from "./canonical";
import { GOLDEN_10 } from "./golden";
import { loadF1, loadF2, loadF3, loadF4, loadF5, loadF6 } from "./fixtures";


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
