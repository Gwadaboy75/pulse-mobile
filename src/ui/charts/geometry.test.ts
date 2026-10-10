import { describe, expect, it } from "vitest";
import { arcPath, areaPath, evenTicks, linePath, linearScale, nearestIndex, segments } from "./geometry";

describe("scales", () => {
  it("maps a domain onto a reversed range", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(25)).toBe(150);
  });
  it("centres a flat domain", () => {
    expect(linearScale([5, 5], [0, 10])(5)).toBe(5);
  });
});

describe("paths", () => {
  const pts = [
    { x: 0, y: 10 },
    { x: 10, y: 20 },
    { x: 20, y: null },
    { x: 30, y: 5 },
    { x: 40, y: 15 },
  ];
  it("breaks the line at a gap", () => {
    expect(segments(pts)).toHaveLength(2);
    expect(linePath(pts)).toBe("M0,10L10,20M30,5L40,15");
  });
  it("closes each run of an area down to the base", () => {
    expect(areaPath(pts, 50)).toBe("M0,10L10,20L10,50L0,50ZM30,5L40,15L40,50L30,50Z");
  });
  it("steps after each point", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 5, y: 3 }, { x: 9, y: 2 }], "stepAfter")).toBe("M0,1L5,1L5,3L9,3L9,2");
  });
  it("a monotone curve never overshoots its points", () => {
    const d = linePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }], "monotone");
    const ys = [...d.matchAll(/C[\d.]+,([\d.-]+),[\d.]+,([\d.-]+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
  });
  it("two points are a straight line even when monotone", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 5, y: 3 }], "monotone")).toBe("M0,1L5,3");
  });
});

describe("arcs", () => {
  it("draws nothing for an empty sweep", () => {
    expect(arcPath(50, 50, 40, 10, 10)).toBe("");
  });
  it("starts at 12 o'clock and ends at 3 o'clock for a quarter turn", () => {
    expect(arcPath(50, 50, 40, 0, 90)).toBe("M50,10A40,40 0 0 1 78.28,21.72A40,40 0 0 1 90,50");
  });
});

describe("nearestIndex and ticks", () => {
  it("snaps to the closest x", () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    expect(nearestIndex([], 3)).toBe(-1);
  });
  it("rounds ticks to a nice step", () => {
    expect(evenTicks(0, 90, 3)).toEqual([0, 50, 100]);
    expect(evenTicks(0, 21, 4)).toEqual([0, 10, 20, 30]);
  });
});
