// The onboarding frame, pulse's AuthShell: the ground, the wordmark, one 400 px column and the step's buttons, centred
// on the screen as one group. Welcome, the connect explainer and the profile step all sit in it.
import type { ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ground } from "@/ui/Ground";
import { Wordmark } from "@/ui/brand";

/** `wordmark` false: the screen draws its own brand (Welcome puts the wordmark under the mark). */
export function Frame({ children, footer, wordmark = true }: { children: ReactNode; footer?: ReactNode; wordmark?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <Ground />
      <ScrollView
        // The whole step sits as one group in the middle of the screen: brand, content, then its buttons right under
        // it, with the spare height split above and below. A step taller than the screen scrolls from the top.
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingTop: Math.max(insets.top, 24) + 16, paddingBottom: Math.max(insets.bottom, 24) + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <View className="mx-auto w-full max-w-[400px] px-5">
          {wordmark && (
            <View className="mb-10 items-center">
              <Wordmark height={16} />
            </View>
          )}
          {children}
          {footer && <View className="mt-10 gap-1">{footer}</View>}
        </View>
      </ScrollView>
    </View>
  );
}
