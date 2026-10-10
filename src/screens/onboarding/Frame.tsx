// The onboarding frame, pulse's AuthShell: the ground, the wordmark at the top, one 400 px column, and a footer pinned to
// the bottom. Welcome, the connect explainer and the profile step all sit in it.
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
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <View className="items-center pb-2" style={{ paddingTop: Math.max(insets.top, 32) }}>
          {wordmark && <Wordmark height={16} />}
        </View>
        <View className="mx-auto w-full max-w-[400px] flex-1 px-5 pt-6">
          <View className="flex-1">{children}</View>
          {footer && (
            <View className="mt-6 gap-1" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
              {footer}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
