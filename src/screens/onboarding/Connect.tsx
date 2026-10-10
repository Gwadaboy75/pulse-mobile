// Connecting Google Health (docs/onboarding.md): the explainer that comes before Google's consent, then the screen that
// waits behind it while Google's sheet is up. Used by onboarding's Connect and by `/connect` (leaving sample data).
// `connectGoogle()` is still a stub, so today it comes back with "isn't available in this build yet" on the explainer.
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";
import { Activity, Footprints, HeartPulse, Moon, PenLine, Utensils, Watch, type LucideIcon } from "lucide-react-native";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { haptic } from "@/ui/haptics";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { connectGoogle } from "../settings/connect";
import { Frame } from "./Frame";

// What each health scope in src/google/oauth.ts SCOPES lets Pulse read, in the person's words, with the icon the app
// uses for that data elsewhere.
const READS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Footprints, title: "Activity", body: "Steps, workouts, calories and active minutes" },
  { icon: HeartPulse, title: "Heart and body", body: "Heart rate, HRV, oxygen, breathing, skin temperature and weight" },
  { icon: Moon, title: "Sleep", body: "Sleep stages and when you slept" },
  { icon: Activity, title: "Heart rhythm", body: "ECG readings and irregular rhythm notifications" },
  { icon: Utensils, title: "Nutrition", body: "Food and water you log" },
  { icon: Watch, title: "Profile and tracker", body: "Your age, your tracker’s battery and its last sync" },
];

/**
 * `onConnected` runs once Google grants access; it may fail (clearing the sample data), and its error shows here.
 * `sample`: the person is leaving sample data, so the explainer says it goes.
 */
export function ConnectFlow({ sample, onConnected, onCancel }: { sample?: boolean; onConnected: () => Promise<string | null>; onCancel: () => void }) {
  const [waiting, setWaiting] = useState(false);
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
    if (failed) {
      setError(failed);
      haptic.error();
    }
  };

  if (waiting)
    return (
      // Behind Google's consent sheet: what the person sees if they look past it, or come back before answering.
      <Frame>
        <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-5 pb-16">
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

  return (
    <Frame
      footer={
        <>
          {error && (
            <Text accessibilityRole="alert" className="mb-2 text-center text-[13px] font-medium leading-[18px] text-recovery-red-text">
              {error}
            </Text>
          )}
          <Button size="sheet" onPress={connect}>
            Connect Google Health
          </Button>
          <Button size="sheet" variant="ghost" haptic={false} onPress={onCancel}>
            Not now
          </Button>
        </>
      }
    >
      <Text accessibilityRole="header" className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]">
        What Pulse reads
      </Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-foreground-secondary">
        From Google Health, kept on this phone. On the next screen Google asks which of these to share.
      </Text>
      <Card className="mt-6 px-4 py-1">
        <Divided>
          {READS.map((r) => (
            <View key={r.title} className="min-h-14 flex-row items-center gap-3.5 py-3">
              <Icon icon={r.icon} size={20} tone="foreground-secondary" />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-[15px] font-semibold leading-5">{r.title}</Text>
                <Text className="text-[13px] leading-[18px] text-muted-foreground">{r.body}</Text>
              </View>
            </View>
          ))}
        </Divided>
      </Card>
      <View className="mt-4 flex-row gap-3.5 px-4">
        <Icon icon={PenLine} size={20} tone="muted-foreground" />
        <Text className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">
          Pulse writes back only what you log in Journal.{sample ? " Your sample data is cleared once Google says yes." : ""}
        </Text>
      </View>
    </Frame>
  );
}
