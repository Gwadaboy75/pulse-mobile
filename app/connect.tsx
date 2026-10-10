import { router } from "expo-router";
import { leaveSample } from "@/actions/sample";
import { clearAll, store } from "@/data/store";
import { ConnectFlow } from "@/screens/onboarding/Connect";
import { leftSample } from "@/screens/onboarding/gate";
import { syncNow } from "@/screens/settings/connect";

// `/connect`: leaving sample data for the person's own (docs/onboarding.md). Opened by the Sample data card and by
// Settings' Connect while the sample is loaded. Google says yes first, then the sample is cleared and onboarding's
// profile step follows, so a cancelled consent keeps the sample.
export default function Connect() {
  return (
    <ConnectFlow
      sample
      onCancel={() => router.back()}
      onConnected={async () => {
        const r = await leaveSample(store, clearAll);
        if (!r.ok) return r.error;
        void syncNow();
        leftSample();
        return null;
      }}
    />
  );
}
