// Settings › App (appearance, notifications). Ported from pulse (app)/settings/SettingsView.tsx (Appearance), SettingsClient
// `ThemePicker` and AppSettings.tsx. The theme is system, light or dark, kept on the device (AsyncStorage `pulse.theme`, applied
// at launch by src/state/app.ts boot). The notification toggles live in Settings › Notifications & background
// (NotificationsSection.tsx); this section links there.
import { useState } from "react";
import { colorScheme } from "nativewind";
import { Bell, Monitor, Moon, Sun } from "lucide-react-native";
import { saveTheme, type AppPrefs, type Theme } from "@/actions/preferences";
import { LinkList } from "@/ui/shells/LinkList";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { HINT, RadioSegments } from "./controls";

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/** Appearance: system, light or dark, as a radio group styled like the profile's segmented control. Kept per device. */
function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);
  return (
    <RadioSegments
      label="Theme"
      value={theme}
      options={THEMES}
      feedback="toggle"
      onChange={(v) => {
        setTheme(v);
        colorScheme.set(v);
        void saveTheme(v);
      }}
    />
  );
}

export function AppSettings({ prefs }: { prefs: AppPrefs }) {
  return (
    <>
      <SectionShell variant="card" title="Appearance">
        <ThemePicker initial={prefs.theme} />
        <Text className={`${HINT} mt-2`}>System follows this device’s light or dark setting.</Text>
      </SectionShell>
      <LinkList title="App" rows={[{ icon: Bell, label: "Notifications & background", href: "/settings?s=notifications" }]} />
    </>
  );
}
