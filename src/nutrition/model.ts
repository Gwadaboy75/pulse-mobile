// The model a food estimate asks: the person's own coach provider and key (BYOK), read where halo's coach keeps them
// (src/coach/storage.ts there): the setup in AsyncStorage "pulse.coach.setup", the key in expo-secure-store
// "pulse.coach.apiKey". A thin reader until Pulse's own src/coach lands; then this file becomes `deviceModel` and
// `useCoachSetup` from src/coach/session.ts. The key is never logged, never shown, never kept anywhere else. Not loaded
// by tests (native modules).
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LanguageModel } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { modelFor, type Fetch } from "@/coach/providers";

export { providerLabel } from "@/coach/providers";

/** What the sheet may know about the setup: never the key itself. */
export type CoachSetup = { provider: string | null; model: string | null; last4: string | null; consent: boolean };

const SETUP_KEY = "pulse.coach.setup";
const API_KEY = "pulse.coach.apiKey";
const EMPTY: CoachSetup = { provider: null, model: null, last4: null, consent: false };

async function coachSetup(): Promise<CoachSetup> {
  const raw = await AsyncStorage.getItem(SETUP_KEY).catch(() => null);
  if (!raw) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<CoachSetup>) };
  } catch {
    return EMPTY;
  }
}

/** halo's `deviceModel`: consent, a provider and model, and a key the keystore can read; else null. */
export async function deviceModel(): Promise<LanguageModel | null> {
  const s = await coachSetup();
  if (!s.consent || !s.provider || !s.model) return null;
  const key = await SecureStore.getItemAsync(API_KEY).catch(() => null);
  return modelFor(s.provider, s.model, key, expoFetch as unknown as Fetch);
}

/** The setup, read once per opening of the sheet; undefined while it loads. */
export function useCoachSetup(): CoachSetup | undefined {
  const [setup, setSetup] = useState<CoachSetup>();
  useEffect(() => {
    let live = true;
    void coachSetup().then((s) => live && setSetup(s));
    return () => {
      live = false;
    };
  }, []);
  return setup;
}
