// Leaving sample data for the person's own (docs/onboarding.md). Runs after Google's consent succeeded, so a cancelled
// consent keeps the sample: every table is emptied in one transaction, except the settings that are not the sample's
// (the new Google grant, the theme). Onboarding's profile step follows (src/screens/onboarding/gate.ts `leftSample`).
import type { Store } from "../data/repos";
import { dataChanged } from "../screens/useScreen";
import type { ActionResult } from "./journal";

export async function leaveSample(store: Store, clearAll: () => void): Promise<ActionResult> {
  try {
    await store.transaction(async (tx) => {
      const [grant, theme] = await Promise.all([tx.settings.get("google.grant"), tx.settings.get("theme")]);
      clearAll();
      if (grant) await tx.settings.set("google.grant", grant);
      if (theme) await tx.settings.set("theme", theme);
    });
  } catch {
    return { ok: false, error: "Couldn’t clear the sample data. Try again." };
  }
  dataChanged();
  return { ok: true, data: undefined };
}
