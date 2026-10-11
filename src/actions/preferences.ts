// Settings › App: the theme and the notification toggles, device preferences kept in AsyncStorage as halo keeps its
// own. Scheduling the notifications is the background stream's.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEME_KEY } from "@/state/app";

export type Theme = "system" | "light" | "dark";
export type NotifyKey = "notify.recovery" | "notify.syncProblem";
export type AppPrefs = { theme: Theme; notifyRecovery: boolean; notifySyncProblem: boolean };

const notifyKey = (k: NotifyKey) => `pulse.${k}`;

export async function loadPrefs(): Promise<AppPrefs> {
  const [theme, recovery, syncProblem] = await Promise.all([THEME_KEY, notifyKey("notify.recovery"), notifyKey("notify.syncProblem")].map((k) => AsyncStorage.getItem(k).catch(() => null)));
  return { theme: theme === "light" || theme === "dark" ? theme : "system", notifyRecovery: recovery === "1", notifySyncProblem: syncProblem === "1" };
}

export async function saveTheme(theme: Theme): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme);
}

export async function saveNotify(key: NotifyKey, on: boolean): Promise<void> {
  await AsyncStorage.setItem(notifyKey(key), on ? "1" : "0");
}
