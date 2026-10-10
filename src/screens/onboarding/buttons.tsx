// Onboarding's two buttons. Connect is drawn like Google's own light sign-in button (white, the four-colour "G", sentence
// case, a thin grey rim) so the step reads as Google's. The second action is a quiet text button. Both hug their label at
// 44 px tall, smaller than the app's sheet buttons: this screen asks, it does not push.
import { ActivityIndicator, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { haptic } from "@/ui/haptics";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";

/** Google's "G" (sign-in branding guidelines), on a 48-unit grid. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size}>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** "Connect Google Health" in Google's light button: #fff fill, #747775 rim, #1f1f1f label (fixed colours, as Google's are). */
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
      {pending ? <ActivityIndicator size="small" color="#1f1f1f" /> : <GoogleG />}
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
