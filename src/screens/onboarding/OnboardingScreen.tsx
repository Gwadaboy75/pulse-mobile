// First run `/onboarding` (docs/onboarding.md). Three steps, no form up front: Welcome (connect Google Health or explore
// with sample data), the explainer that comes before Google's consent screen, then the profile. The profile step is pulse's
// src/app/onboarding/Onboarding.tsx on the AuthShell frame: only what Google can't tell us, its Health profile has an age in
// whole years but no birth date and no sex; height and weight come from Google data later, max HR is estimated, and the
// time zone is the device's, one tap to change. It comes after the connect so it can fill the wait of the first sync.
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { store } from "@/data/store";
import { loadDemoData, type SeedProgress } from "@/seed/load";
import { haptic } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Lock } from "lucide-react-native";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { syncNow } from "../settings/connect";
import { ConnectFlow } from "./Connect";
import { Frame } from "./Frame";
import { onboardingStart, profileSaved } from "./gate";
import { GoogleButton, TextButton } from "./buttons";
import { HeartbeatMark } from "./HeartbeatMark";
import { ProfileForm, SaveButton } from "./ProfileForm";

type Step = "welcome" | "connect" | "profile";

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>(onboardingStart);
  if (step === "welcome") return <Welcome onConnect={() => setStep("connect")} />;
  if (step === "connect")
    return (
      <ConnectFlow
        onCancel={() => setStep("welcome")}
        onConnected={async () => {
          // The first sync starts now and runs while the profile is asked.
          void syncNow();
          setStep("profile");
          return null;
        }}
      />
    );
  return <Profile />;
}

/** A month of the demo story: enough for baselines and every score, and quick to build on a phone. */
const SAMPLE_DAYS = 30;

const PHASE_LABEL: Record<SeedProgress["phase"], string> = { generate: "Generating days", write: "Saving", score: "Scoring" };

function Welcome({ onConnect }: { onConnect: () => void }) {
  const [progress, setProgress] = useState<SeedProgress | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const explore = async () => {
    setError(null);
    setProgress("starting");
    try {
      // The flag goes first: a seed that stops halfway still shows the Sample data card that offers the way out.
      await store.settings.set("sample", true);
      await loadDemoData(store, { onProgress: setProgress, days: SAMPLE_DAYS });
      haptic.success();
      // The demo saved its own profile: the gate opens on the sample data.
      profileSaved();
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "Couldn’t build the sample data. Try again.");
      haptic.error();
    }
  };

  const p = progress === "starting" ? null : progress;
  return (
    <Frame
      wordmark={false}
      footer={
        progress ? (
          <View accessibilityLiveRegion="polite" className="h-[132px] items-center justify-center gap-3 px-6">
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: p?.total ?? 1, now: p?.done ?? 0 }} className="h-2 w-full overflow-hidden rounded-full bg-fill-pressed">
              <View className="h-full rounded-full bg-primary" style={{ width: `${p && p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
            </View>
            <Text className="text-[13px] leading-[18px] text-foreground-secondary">{p ? PHASE_LABEL[p.phase] : "Building sample data"}…</Text>
          </View>
        ) : (
          <>
            {error && (
              <Text accessibilityRole="alert" className="mb-2 text-center text-[13px] font-medium leading-[18px] text-recovery-red-text">
                {error}
              </Text>
            )}
            <GoogleButton onPress={onConnect} />
            <TextButton label="Explore with sample data" onPress={explore} />
            <View className="mt-2 flex-row items-center justify-center gap-1.5">
              <Icon icon={Lock} size={13} tone="muted-foreground" strokeWidth={2} />
              <Text className="text-[13px] leading-[18px] text-muted-foreground">Stays on this phone. No account, no server.</Text>
            </View>
          </>
        )
      }
    >
      <View className="flex-1 items-center justify-center gap-8 pb-4">
        <HeartbeatMark />
        <View className="items-center gap-2">
          <Text accessibilityRole="header" className="text-center text-[24px] font-bold leading-[30px] tracking-[-0.02em]">
            Your Fitbit, scored every morning
          </Text>
          <Text className="max-w-[300px] text-center text-[15px] leading-[22px] text-foreground-secondary">Sleep, Recovery and Strain from Google Health, worked out on this phone.</Text>
        </View>
      </View>
    </Frame>
  );
}

function Profile() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  return (
    <Frame>
      {/* Baro's "Loading your Google Health data": the first sync runs behind this step, and Home fills in as it lands. */}
      <View accessibilityLiveRegion="polite" className="mb-8 flex-row items-center gap-2.5">
        <ActivityIndicator size="small" color={c["muted-foreground"]} />
        <Text className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">Loading your Google Health data in the background</Text>
      </View>
      <Text accessibilityRole="header" className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]">
        Two things Google doesn’t share
      </Text>
      <Text className="mb-7 mt-2 text-base leading-6 text-foreground-secondary">Pulse scores your heart rate against your age and sex. You can change these later in Settings.</Text>
      <ProfileForm
        onboarding
        defaults={{ birthDate: "", sex: null, maxHr: null, heightCm: null, timeZone: null }}
        // The gate opens: the root layout swaps onboarding for the tabs, so Home is next (app/_layout.tsx).
        onSaved={() => {
          haptic.success();
          profileSaved();
        }}
        footer={({ pending, submit }) => (
          <View className="mt-2" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
            <SaveButton pending={pending} label="Save and continue" onPress={submit} />
          </View>
        )}
      />
    </Frame>
  );
}
