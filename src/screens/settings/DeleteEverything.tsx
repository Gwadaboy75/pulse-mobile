// Settings › Profile › Delete everything. The web's "Delete account" (a quiet red-outlined pill at the foot of Account, a
// dialog that asks for the password) without an account: the confirmation is entered twice in place of the password, then
// every row and setting is deleted and the app goes back to onboarding (src/state/app.ts reset).
import { useState } from "react";
import { View } from "react-native";
import { reset } from "@/state/app";
import { haptic } from "@/ui/haptics";
import { Text } from "@/ui/Text";
import { ConfirmDialog } from "./controls";
import { Press } from "@/ui/Press";

export function DeleteEverything() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (pending) return;
    setStep(0);
    setError(null);
  };
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      // On success the gate closes and onboarding shows; only a failure comes back here.
      await reset();
    } catch {
      setError("Couldn’t delete everything. Try again.");
    }
    setPending(false);
  };
  return (
    <>
      <View className="items-center pb-2 pt-6">
        <Press
          activeBg="bg-recovery-red/10"
          accessibilityRole="button"
          onPress={() => {
            haptic.tap();
            setStep(1);
          }}
          // Outlined in red: easy to find, clearly destructive, still quieter than the everyday buttons above.
          className="h-11 items-center justify-center rounded-full border border-recovery-red/45 px-5"
        >
          <Text className="text-[13px] font-bold uppercase tracking-[0.06em] text-recovery-red-text">Delete everything</Text>
        </Press>
      </View>
      <ConfirmDialog
        open={step === 1}
        title="Delete everything?"
        description="Removes everything Pulse stored on this phone: imported data, scores, journal, logs, profile and settings. Health Connect keeps its own copy. Export what you want to keep first (More › Your data)."
        confirmLabel="Delete everything"
        pendingLabel="Delete everything"
        pending={false}
        onCancel={close}
        onConfirm={() => setStep(2)}
      />
      <ConfirmDialog
        open={step === 2}
        title="Delete everything for good?"
        description="This can’t be undone: your data is only on this phone, so nothing can bring it back. Pulse asks for your profile again."
        error={error}
        confirmLabel="Yes, delete it all"
        pendingLabel="Deleting…"
        pending={pending}
        onCancel={close}
        onConfirm={run}
      />
    </>
  );
}
