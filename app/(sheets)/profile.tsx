import { View } from "react-native";
import { ProfileForm, SaveButton } from "@/screens/onboarding/ProfileForm";
import { toast } from "@/ui/Toast";
import { useScreen } from "@/screens/useScreen";
import { SheetScreen } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";

// Settings › Profile › Edit (U19): the onboarding fields in a sheet. Saving recomputes every day's scores. Registered in
// app/_layout.tsx. Ported from pulse (app)/settings/SettingsClient.tsx `EditProfileButton`.
export default function EditProfile() {
  const { data } = useScreen(async (ctx) => ctx.profile, ["profile"]);
  return (
    <SheetScreen title="Profile" description="Changing it recomputes every day’s scores.">
      {/* The web wraps the form in its own `px-4`: 32 px of side margin. Its `pb-[max(env(safe-area-inset-bottom),16px)]` is
          the sheet's own bottom padding here (SheetScreen). */}
      <View className="px-4">
        {data && (
          <ProfileForm
            defaults={{ birthDate: data.birthDate, sex: data.sex, maxHr: data.maxHr, heightCm: data.heightCm, timeZone: data.timeZone, name: data.name }}
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
