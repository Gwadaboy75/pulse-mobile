// F1 (fixtures/f1-mappers.json): every Google payload pulse's mappers were run on, and the rows they produced.
// A Map (mapHeartRate, mapStepsMinutes) is recorded as its [key, value] entries in insertion order.
import { describe, expect, it } from "vitest";
import { loadF1 } from "../testing/fixtures";
import { mapDaily, mapExercises, mapHeartRate, mapLogEntries, mapRollup, mapSleep, mapStepsMinutes } from "./map";

type Args = Record<string, string>;
const MAPPERS: Record<string, (points: unknown[], a: Args) => unknown> = {
  mapDaily: (p, a) => mapDaily(a.type as Parameters<typeof mapDaily>[0], p, a.tz),
  mapRollup: (p, a) => mapRollup(a.type as Parameters<typeof mapRollup>[0], p),
  mapHeartRate: (p) => [...mapHeartRate(p)],
  mapStepsMinutes: (p) => [...mapStepsMinutes(p)],
  mapSleep: (p, a) => mapSleep(p, a.tz),
  mapExercises: (p, a) => mapExercises(p, a.tz),
  mapLogEntries: (p, a) => mapLogEntries(a.type as Parameters<typeof mapLogEntries>[0], p, a.tz),
};

const f1 = loadF1();

describe("F1: the mappers produce exactly the recorded rows", () => {
  it("covers every mapper the fixture uses", () => {
    expect(new Set(f1.cases.map((c) => c.mapper))).toEqual(new Set(Object.keys(MAPPERS)));
    expect(f1.cases).toHaveLength(21);
  });

  for (const c of f1.cases) {
    it(`${c.file} -> ${c.mapper}(${Object.values(c.args).join(", ")})`, () => {
      const points = c.payload.dataPoints ?? c.payload.rollupDataPoints ?? [];
      // The fixture is JSON: round-trip the output so an undefined field compares as the absent one it was recorded as.
      expect(JSON.parse(JSON.stringify(MAPPERS[c.mapper](points, c.args)))).toStrictEqual(c.rows);
    });
  }
});
