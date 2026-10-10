// The person's profile (one row). Replaces the database parts of pulse src/server/profile.ts. Resolving max HR
// (Tanaka) and the Google height fallback (`dailyRepo.googleHeight`) stays in the port's `getProfile`.
import { eq } from "drizzle-orm";
import { profile } from "../schema";
import type { Db } from "../types";

/** The stored row. `maxHr` null means estimate it from age. */
export type ProfileRow = {
  birthDate: string;
  sex: "male" | "female";
  maxHr: number | null;
  heightCm: number | null;
  /** IANA zone: the person's days start at local midnight there. */
  timeZone: string;
  updatedAt: number;
};

export type ProfileInput = Omit<ProfileRow, "updatedAt">;

export interface ProfileRepo {
  /** The stored profile, or null before onboarding. profile.ts:39 `getProfile` */
  getProfileRow(): Promise<ProfileRow | null>;
  /** The time zone alone, or null before onboarding. profile.ts:80 `userTimeZone` */
  userTimeZone(): Promise<string | null>;
  /**
   * Saves the profile; false and nothing written when birth date, sex, max HR, height and time zone all equal the
   * stored ones (`updatedAt` alone never counts). The port runs this and `scoresRepo.markAllDaysDirty()` in one
   * `store.transaction` when it returns true. profile.ts:65 `saveProfile`
   */
  saveProfile(input: ProfileInput, now: number): Promise<boolean>;
}

export function profileRepo(db: Db): ProfileRepo {
  const p = profile;
  const read = () => db.select({ birthDate: p.birthDate, sex: p.sex, maxHr: p.maxHr, heightCm: p.heightCm, timeZone: p.timeZone, updatedAt: p.updatedAt }).from(p).where(eq(p.id, 1)).all()[0] ?? null;
  return {
    async getProfileRow() {
      return read();
    },
    async userTimeZone() {
      return db.select({ tz: p.timeZone }).from(p).where(eq(p.id, 1)).all()[0]?.tz ?? null;
    },
    async saveProfile(input, now) {
      const before = read();
      if (before && before.birthDate === input.birthDate && before.sex === input.sex && before.maxHr === input.maxHr && before.heightCm === input.heightCm && before.timeZone === input.timeZone) {
        return false;
      }
      const row = { ...input, updatedAt: now };
      db.insert(p).values({ id: 1, ...row }).onConflictDoUpdate({ target: p.id, set: row }).run();
      return true;
    },
  };
}
