// F5: runs the time fixture exported from pulse through src/time.ts. Pure, so Vitest (Node) and the
// app/dev/time screen (Hermes) run the same check.
import { fromWall, localMidnight, localMinutes, utcOffsetS, wall } from "./time";

export type F5 = {
  generatedFrom: string;
  wall: { tz: string; s: number; day: string; time: string; asUtc: number }[];
  localMidnight: { tz: string; day: string; s: number }[];
  fromWall: { tz: string; civil: string; s: number }[];
  localMinutes: { tz: string; s: number; minutes: number }[];
  utcOffsetS: { tz: string; s: number; offset: number }[];
};

export type F5Failure = { fn: string; input: object; expected: unknown; got: unknown };

export function checkF5(f5: F5) {
  const failed: F5Failure[] = [];
  let total = 0;
  const check = (fn: string, input: object, expected: unknown, run: () => unknown) => {
    total++;
    let got: unknown;
    try {
      got = run();
    } catch (e) {
      got = `threw ${String(e)}`; // e.g. a RangeError for a zone the engine's Intl does not know
    }
    if (JSON.stringify(got) !== JSON.stringify(expected)) failed.push({ fn, input, expected, got });
  };
  for (const c of f5.wall) {
    // Both sides rebuilt in one key order, so the JSON comparison does not depend on the fixture's.
    check("wall", { tz: c.tz, s: c.s }, { day: c.day, time: c.time, asUtc: c.asUtc }, () => {
      const { day, time, asUtc } = wall(c.s, c.tz);
      return { day, time, asUtc };
    });
  }
  for (const c of f5.localMidnight) check("localMidnight", { tz: c.tz, day: c.day }, c.s, () => localMidnight(c.day, c.tz));
  for (const c of f5.fromWall) check("fromWall", { tz: c.tz, civil: c.civil }, c.s, () => fromWall(c.civil, c.tz));
  for (const c of f5.localMinutes) check("localMinutes", { tz: c.tz, s: c.s }, c.minutes, () => localMinutes(c.s, c.tz));
  for (const c of f5.utcOffsetS) check("utcOffsetS", { tz: c.tz, s: c.s }, c.offset, () => utcOffsetS(c.s, c.tz));
  return { total, failed };
}
