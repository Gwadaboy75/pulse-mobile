// Onboarding's two buttons. Connect is drawn like Google's own light sign-in button (white, sentence case, a thin grey
// rim) with the Google Health mark Settings uses (GoogleFit), so the step reads as Google's. The second action is a quiet text button. Both hug their label at
// 44 px tall, smaller than the app's sheet buttons: this screen asks, it does not push.
import { ActivityIndicator, View } from "react-native";
import { haptic } from "@/ui/haptics";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { GoogleFit } from "../settings/GoogleFit";

/** "Connect Google Health" in Google's light button with the Google Health mark: #fff fill, #747775 rim, #1f1f1f label (fixed colours, as Google's are). */
export function GoogleButton({ label = "Connect Google Health", pending, onPress }: { label?: string; pending?: boolean; onPress: () => void }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: !!pending, busy: !!pending }}
      disabled={pending}
      activeScale={0.96}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      className="h-11 flex-row items-center justify-center gap-2.5 self-center rounded-full border border-[#747775] bg-white pl-4 pr-5"
    >
      {pending ? <ActivityIndicator size="small" color="#1f1f1f" /> : <GoogleFit size={20} />}
      <Text className="text-[14px] font-semibold leading-5 text-[#1f1f1f]">{label}</Text>
    </Press>
  );
}

/** The second action ("Explore with sample data", "Not now"): text only, a 44 px tall target. */
export function TextButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View className="items-center">
      <Press accessibilityRole="button" disabled={disabled} activeOpacity={0.6} onPress={onPress} className="h-11 justify-center px-4">
        <Text className="text-[14px] font-semibold leading-5 text-foreground-secondary">{label}</Text>
      </Press>
    </View>
  );
}
