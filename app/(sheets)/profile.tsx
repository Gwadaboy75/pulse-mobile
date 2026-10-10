import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileForm, SaveButton } from "@/screens/onboarding/ProfileForm";
import { toast } from "@/ui/Toast";
import { useScreen } from "@/screens/useScreen";
import { SheetScreen } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";

// Settings › Profile › Edit (U19): the onboarding fields in a sheet. Saving recomputes every day's scores. Registered in
// app/_layout.tsx. Ported from pulse (app)/settings/SettingsClient.tsx `EditProfileButton`.
export default function EditProfile() {
  const { data } = useScreen(async (ctx) => ctx.profile, []);
  const insets = useSafeAreaInsets();
  return (
    <SheetScreen title="Profile" description="Changing it recomputes every day’s scores." size="tall">
      {/* The web wraps the form in its own `px-4 pb-[max(env(safe-area-inset-bottom),16px)]` inside the drawer's `px-4 pb-4`:
          32 px of side margin, and the sheet's own 24 px foot here leaves max(inset, 16) - 8 to add. */}
      <View className="px-4" style={{ paddingBottom: Math.max(insets.bottom, 16) - 8 }}>
        {data && (
          <ProfileForm
            defaults={{ birthDate: data.birthDate, sex: data.sex, maxHr: data.maxHrSource === "set" ? data.maxHr : null, heightCm: data.heightCm, timeZone: data.timeZone }}
            onSaved={() => {
              closeSheet();
              toast.success("Profile saved. Scores are being recomputed.");
            }}
            footer={({ pending, submit }) => <SaveButton pending={pending} label="Save profile" onPress={submit} />}
          />
        )}
      </View>
    </SheetScreen>
  );
}
