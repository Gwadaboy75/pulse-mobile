import { expect, it } from "vitest";

import f5 from "../fixtures/f5-time.json";
import { checkF5 } from "./timeParity";

it("src/time.ts reproduces every case of pulse's F5 time fixture", () => {
  const { total, failed } = checkF5(f5);
  expect(total).toBeGreaterThan(0);
  expect(failed).toEqual([]);
});
