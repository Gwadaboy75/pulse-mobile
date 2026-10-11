// Onboarding and Settings › Profile: one action for both. The form hands over its fields as typed (strings), checked
// with pulse's rules; `save` writes the profile (src/state/app.ts saveProfile, which also reruns the scores).
import { z } from "zod";
import type { Profile } from "@/data/types";
import { wholeYears } from "@/lib/time";
import { isTimeZone } from "@/lib/timeZone";

/** What onboarding and Settings submit. Ages 13 to 100. */
export const ProfileInput = z.object({
  birthDate: z.iso.date().refine((d) => {
    const age = wholeYears(d, new Date().toISOString().slice(0, 10));
    return age >= 13 && age <= 100;
  }, "Enter a birth date between 13 and 100 years ago"),
  sex: z.enum(["male", "female"], "Choose one"),
  maxHr: z.coerce.number().int().min(100, "Between 100 and 240").max(240, "Between 100 and 240").nullable(),
  heightCm: z.coerce.number().min(100, "Between 100 and 250 cm").max(250, "Between 100 and 250 cm").nullable(),
  timeZone: z.string().refine(isTimeZone, "Choose a time zone"),
});
// eslint-disable-next-line @typescript-eslint/no-redeclare -- pulse's pattern: the schema and its type share a name
export type ProfileInput = z.infer<typeof ProfileInput>;

export type ProfileFormState =
  | { ok: true; error?: undefined; fields?: undefined }
  | { ok: false; error?: string; fields?: Partial<Record<keyof ProfileInput, string>> };

/** The form's values as typed: `sex` and `timeZone` null until chosen, the optional numbers blank when not set. */
export type ProfileFields = { birthDate: string; sex: string | null; maxHr: string; heightCm: string; timeZone: string | null };

const optional = (v: string) => (v.trim() !== "" ? v.trim() : null);

/** Checks the form; on success saves `{ ...previous, ...fields }` (a waist set elsewhere stays) through `save`. */
export async function saveProfileAction(form: ProfileFields, previous: Profile | null, save: (p: Profile) => Promise<void>): Promise<ProfileFormState> {
  const r = ProfileInput.safeParse({
    birthDate: form.birthDate,
    sex: form.sex ?? undefined,
    maxHr: optional(form.maxHr),
    heightCm: optional(form.heightCm),
    timeZone: form.timeZone ?? undefined,
  });
  if (!r.success) {
    const fields: Partial<Record<keyof ProfileInput, string>> = {};
    for (const i of r.error.issues) fields[i.path[0] as keyof ProfileInput] ??= i.path[0] === "birthDate" && i.code !== "custom" ? "Enter your birth date" : i.message;
    return { ok: false, fields };
  }
  try {
    await save({ ...previous, ...r.data });
  } catch {
    return { ok: false, error: "Couldn’t save. Try again." };
  }
  return { ok: true };
}
