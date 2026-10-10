// Connecting Google Health (docs/onboarding.md): the explainer that comes before Google's consent, then the screen that
// waits behind it while Google's sheet is up, and "Reconnect Google Health" when the person closes Google's consent. Used by
// onboarding's Connect and by `/connect` (leaving sample data). Android shows Google's own account chooser and consent
// screens over the app; iOS shows Google's consent in the in-app sign-in sheet. Neither leaves the app.
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";
import { Activity, Footprints, HeartPulse, Moon, Utensils, Watch, type LucideIcon } from "lucide-react-native";
import { Card } from "@/ui/Card";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { haptic } from "@/ui/haptics";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { connectGoogle } from "../settings/connect";
import { GoogleButton, TextButton } from "./buttons";
import { Frame } from "./Frame";

// What the health scopes in src/google/oauth.ts SCOPES let Pulse read, in the person's words, with the app's icons. Titles
// only, so the screen fits without scrolling; Google's own consent screen has the detail.
const READS: { icon: LucideIcon; title: string }[] = [
  { icon: Footprints, title: "Activity and workouts" },
  { icon: HeartPulse, title: "Heart rate, HRV and body" },
  { icon: Moon, title: "Sleep" },
  { icon: Activity, title: "ECG and heart rhythm" },
  { icon: Utensils, title: "Food and water you log" },
  { icon: Watch, title: "Your age and tracker" },
];

/**
 * `onConnected` runs once Google grants access; it may fail (clearing the sample data), and its error shows here.
 * `sample`: the person is leaving sample data, so the explainer says it goes.
 */
export function ConnectFlow({ sample, onConnected, onCancel }: { sample?: boolean; onConnected: () => Promise<string | null>; onCancel: () => void }) {
  const [waiting, setWaiting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { c } = useTheme();
  // Android back is "Not now"; while Google's sheet is up there is nothing to go back to.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (waiting || onCancel(), true));
    return () => sub.remove();
  }, [waiting, onCancel]);

  const connect = async () => {
    setWaiting(true);
    setError(null);
    const r = await connectGoogle();
    const failed = r.ok ? await onConnected() : r.error;
    setWaiting(false);
    setCancelled(!r.ok && !!r.cancelled);
    if (failed) {
      setError(failed);
      haptic.error();
    }
  };

  if (waiting)
    return (
      // Behind Google's consent sheet: what the person sees if they look past it, or come back before answering.
      <Frame>
        <View accessibilityLiveRegion="polite" className="items-center gap-5">
          <ActivityIndicator size="large" color={c["foreground-secondary"]} />
          <View className="items-center gap-2">
            <Text accessibilityRole="header" className="text-center text-[22px] font-semibold leading-7 tracking-[-0.01em]">
              Waiting for Google
            </Text>
            <Text className="max-w-[300px] text-center text-[15px] leading-[22px] text-foreground-secondary">Choose what Pulse can read in Google’s window. You come back here when you’re done.</Text>
          </View>
        </View>
      </Frame>
    );

  if (cancelled)
    // Google's consent was closed without an answer: the way back in, and the way out.
    return (
      <Frame
        footer={
          <>
            <GoogleButton onPress={connect} />
            <TextButton label="Not now" onPress={onCancel} />
          </>
        }
      >
        <View className="items-center gap-2">
          <Text accessibilityRole="header" className="text-center text-[22px] font-semibold leading-7 tracking-[-0.01em]">
            Reconnect Google Health
          </Text>
          <Text className="max-w-[300px] text-center text-[15px] leading-[22px] text-foreground-secondary">
            Google Health is asking for access. Choose what Pulse can read to continue.
          </Text>
        </View>
      </Frame>
    );

  return (
    <Frame
      footer={
        <>
          {error && (
            <Text accessibilityRole="alert" className="mb-2 text-center text-[13px] font-medium leading-[18px] text-recovery-red-text">
              {error}
            </Text>
          )}
          <GoogleButton onPress={connect} />
          <TextButton label="Not now" onPress={onCancel} />
        </>
      }
    >
      <Text accessibilityRole="header" className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]">
        What Pulse reads
      </Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-foreground-secondary">
        From Google Health, kept on this phone.{sample ? " Your sample data is cleared once you connect." : ""}
      </Text>
      <Card className="mt-6 px-4 py-1">
        <Divided>
          {READS.map((r) => (
            <View key={r.title} className="min-h-12 flex-row items-center gap-3.5 py-2.5">
              <Icon icon={r.icon} size={20} tone="foreground-secondary" />
              <Text className="min-w-0 flex-1 text-[15px] font-medium leading-5">{r.title}</Text>
            </View>
          ))}
        </Divided>
      </Card>
    </Frame>
  );
}
