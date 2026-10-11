import { describe, expect, it } from "vitest";
import type { Profile } from "@/data/types";
import { saveProfileAction } from "./profile";

const form = { birthDate: "1990-05-01", sex: "female", maxHr: "", heightCm: " 170 ", timeZone: "Asia/Kolkata" };

describe("saveProfileAction", () => {
  it("saves the checked fields over the previous profile, a blank max HR as estimated", async () => {
    const saved: Profile[] = [];
    const previous: Profile = { birthDate: "1980-01-01", sex: "male", maxHr: 190, heightCm: null, waistCm: 80, timeZone: "UTC" };
    expect(await saveProfileAction(form, previous, async (p) => void saved.push(p))).toEqual({ ok: true });
    expect(saved).toEqual([{ birthDate: "1990-05-01", sex: "female", maxHr: null, heightCm: 170, waistCm: 80, timeZone: "Asia/Kolkata" }]);
  });

  it("names each bad field and saves nothing", async () => {
    let calls = 0;
    const r = await saveProfileAction({ ...form, birthDate: "", sex: null, maxHr: "300", timeZone: "Mars/Base" }, null, async () => void calls++);
    expect(r).toEqual({
      ok: false,
      fields: { birthDate: "Enter your birth date", sex: "Choose one", maxHr: "Between 100 and 240", timeZone: "Choose a time zone" },
    });
    expect(calls).toBe(0);
  });
});
