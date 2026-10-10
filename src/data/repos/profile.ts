// The person's profile (one row). Replaces the database parts of pulse src/server/profile.ts. Resolving max HR
// (Tanaka) and the Google height fallback (`dailyRepo.googleHeight`) stays in the port's `getProfile`.
import type { Db } from "../types";
import { todo } from "./todo";

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

export function profileRepo(_db: Db): ProfileRepo {
  return {
    getProfileRow: async () => todo("profileRepo.getProfileRow"),
    userTimeZone: async () => todo("profileRepo.userTimeZone"),
    saveProfile: async () => todo("profileRepo.saveProfile"),
  };
}
