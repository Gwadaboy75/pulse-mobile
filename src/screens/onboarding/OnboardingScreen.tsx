// First run `/onboarding` (docs/onboarding.md). Three steps, no form up front: Welcome (connect Google Health or explore
// with sample data), the explainer that comes before Google's consent screen, then the profile. The profile step is pulse's
// src/app/onboarding/Onboarding.tsx on the AuthShell frame: only what Google can't tell us, its Health profile has an age in
// whole years but no birth date and no sex; height and weight come from Google data later, max HR is estimated, and the
// time zone is the device's, one tap to change. It comes after the connect so it can fill the wait of the first sync.
import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { store } from "@/data/store";
import { loadDemoData, type SeedProgress } from "@/seed/load";
import { Button } from "@/ui/Button";
import { Ground } from "@/ui/Ground";
import { haptic } from "@/ui/haptics";
import { Mark, Wordmark } from "@/ui/brand";
import { Text } from "@/ui/Text";
import { connectGoogle } from "../settings/connect";
import { profileSaved } from "./gate";
import { ProfileForm, SaveButton } from "./ProfileForm";

type Step = "welcome" | "explain" | "profile";

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>("welcome");
  // Android back on the explainer returns to Welcome instead of leaving the app.
  useEffect(() => {
    if (step !== "explain") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (setStep("welcome"), true));
    return () => sub.remove();
  }, [step]);
  if (step === "welcome") return <Welcome onConnect={() => setStep("explain")} />;
  if (step === "explain") return <Explain onConnected={() => setStep("profile")} onCancel={() => setStep("welcome")} />;
  return <Profile />;
}

/** The AuthShell frame: the ground, the wordmark at the top, one 400 px column, the footer pinned to the bottom. */
function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <Ground />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <View className="items-center pb-2" style={{ paddingTop: Math.max(insets.top, 32) }}>
          <Wordmark height={16} />
        </View>
        <View className="mx-auto w-full max-w-[400px] flex-1 px-5 pt-6">
          <View className="flex-1">{children}</View>
          {footer && (
            <View className="mt-6 gap-2" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
              {footer}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
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
      // The flag goes first: a seed that stops halfway still shows the banner that offers to start over.
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
      footer={
        progress ? (
          <View accessibilityLiveRegion="polite" className="h-[120px] items-center justify-center gap-3">
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: p?.total ?? 1, now: p?.done ?? 0 }} className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <View className="h-full rounded-full bg-primary" style={{ width: `${p && p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
            </View>
            <Text className="text-[13px] leading-[18px] text-foreground-secondary">{p ? PHASE_LABEL[p.phase] : "Building sample data"}…</Text>
          </View>
        ) : (
          <>
            <Button size="sheet" onPress={onConnect}>
              Connect Google Health
            </Button>
            <Button size="sheet" variant="ghost" haptic={false} onPress={explore}>
              Explore with sample data
            </Button>
            {error && (
              <Text accessibilityRole="alert" className="text-center text-[13px] font-medium leading-[18px] text-recovery-red-text">
                {error}
              </Text>
            )}
            <Text className="mt-2 text-center text-[13px] leading-[18px] text-muted-foreground">Your data syncs from Google Health to this phone. Pulse has no server and no account.</Text>
          </>
        )
      }
    >
      <View className="flex-1 items-center justify-center">
        <Mark size={88} />
      </View>
    </Frame>
  );
}

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

function Explain({ onConnected, onCancel }: { onConnected: () => void; onCancel: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setPending(true);
    setError(null);
    const r = await connectGoogle();
    setPending(false);
    if (r.ok) onConnected();
    else {
      setError(r.error);
      haptic.error();
    }
  };
  return (
    <Frame
      footer={
        <>
          {error && (
            <Text accessibilityRole="alert" className="mb-2 text-center text-[13px] font-medium leading-[18px] text-recovery-red-text">
              {error}
            </Text>
          )}
          <Button size="sheet" disabled={pending} onPress={connect}>
            {pending ? "Waiting for Google…" : "Connect Google Health"}
          </Button>
          <Button size="sheet" variant="ghost" haptic={false} disabled={pending} onPress={onCancel}>
            Not now
          </Button>
        </>
      }
    >
      <Text accessibilityRole="header" className="text-[28px] font-bold leading-[34px] tracking-[-0.02em]">
        How Pulse uses your health data
      </Text>
      <Text className="mb-6 mt-2 text-base leading-6 text-foreground-secondary">Pulse reads these from Google Health and keeps them on this phone. Google asks you which to share next.</Text>
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

function Profile() {
  const insets = useSafeAreaInsets();
  return (
    <Frame>
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
