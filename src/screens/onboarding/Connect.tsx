// Connecting Google Health (docs/onboarding.md): the explainer that comes before Google's consent, then the screen that
// waits behind it while Google's sheet is up. Used by onboarding's Connect and by `/connect` (leaving sample data).
// `connectGoogle()` is still a stub, so today it comes back with "isn't available in this build yet" on the explainer.
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";
import { Button } from "@/ui/Button";
import { haptic } from "@/ui/haptics";
import { Mark } from "@/ui/brand";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { connectGoogle } from "../settings/connect";
import { Frame } from "./Frame";

// What each health scope in src/google/oauth.ts SCOPES lets Pulse read, in the person's words.
const READS: { title: string; body: string }[] = [
  { title: "Activity and fitness", body: "Steps, workouts, calories and active minutes." },
  { title: "Heart and body", body: "Heart rate, HRV, oxygen saturation, breathing rate, skin temperature and weight." },
  { title: "Sleep", body: "Sleep stages and nightly timing." },
  { title: "ECG and heart rhythm", body: "ECG readings and irregular rhythm notifications." },
  { title: "Nutrition", body: "Food and water you log." },
  { title: "Profile and tracker", body: "Your age, and your tracker’s battery and last sync." },
  { title: "What Pulse writes", body: "Only what you log in Journal: food, water, weight, mindfulness, symptoms and cycle entries." },
];

/**
 * `onConnected` runs once Google has said yes; it may fail (clearing the sample data), and its error shows here.
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
        <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-6">
          <Mark size={72} />
          <View className="items-center gap-2">
            <Text accessibilityRole="header" className="text-center text-[22px] font-bold leading-7">
              Google Health is asking for access
            </Text>
            <Text className="text-center text-[15px] leading-[22px] text-foreground-secondary">Choose what Pulse can read in Google’s window, then you’re back here.</Text>
          </View>
          <ActivityIndicator color={c["foreground-secondary"]} />
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
        How Pulse uses your health data
      </Text>
      <Text className="mb-6 mt-2 text-base leading-6 text-foreground-secondary">
        Pulse reads these from Google Health and keeps them on this phone. Google asks you which to share next.
        {sample ? " Once you say yes, the sample data is cleared." : ""}
      </Text>
      <View className="gap-4">
        {READS.map((r) => (
          <View key={r.title} className="gap-0.5">
            <Text className="text-[15px] font-semibold leading-5">{r.title}</Text>
            <Text className="text-[13px] leading-[18px] text-foreground-secondary">{r.body}</Text>
          </View>
        ))}
      </View>
    </Frame>
  );
}
