// Home's "Sample data" card (docs/onboarding.md): shown while the database holds onboarding's generated demo. "Connect your
// data" clears it with Delete everything and the app restarts on Welcome, so sample rows never mix with Google's.
import { useState } from "react";
import { Pressable } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { deleteEverything } from "@/actions/reset";
import { Card } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { LABEL } from "@/ui/metrics/primitives";
import { Text } from "@/ui/Text";
import { forgetCoachKey, forgetGoogleTokens } from "../settings/connect";
import { ConfirmDialog } from "../settings/controls";
import { useScreen } from "../useScreen";

export function SampleBanner() {
  const sample = useScreen((ctx) => ctx.store.settings.get("sample"), []).data;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sample) return null;

  const run = async () => {
    setPending(true);
    setError(null);
    const r = await deleteEverything(async () => {
      await forgetGoogleTokens();
      await forgetCoachKey();
    });
    // On success the app restarts; only a failure comes back.
    setPending(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <>
      <Card className="gap-1 px-4">
        <Text className={LABEL}>Sample data</Text>
        <Text className="text-[13px] leading-[18px] text-foreground-secondary">These numbers are generated for exploring the app. They are not your health data.</Text>
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} className="mt-2 min-h-11 flex-row items-center justify-between active:opacity-70">
          <Text className="text-[15px] font-semibold leading-5">Connect your data</Text>
          <Icon icon={ArrowUpRight} size={18} tone="foreground-secondary" strokeWidth={1.75} />
        </Pressable>
      </Card>
      <ConfirmDialog
        open={open}
        title="Leave sample data?"
        description="Pulse clears the sample data and restarts, so you can connect Google Health. Anything you added while exploring goes with it."
        error={error}
        confirmLabel="Clear and restart"
        pendingLabel="Clearing…"
        pending={pending}
        confirmVariant="primary"
        onCancel={() => !pending && (setOpen(false), setError(null))}
        onConfirm={run}
      />
    </>
  );
}
