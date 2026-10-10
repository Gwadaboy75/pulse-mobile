import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedScrollHandler, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { Ground } from "../Ground";
import { useBottomClearance } from "./layout";

/** A screen's scroll position as a shared value, and a 0-1 `collapsed` that eases to 1 once `threshold` is scrolled past. */
export function useCollapse(durationIn = 220, durationOut = 150) {
  const scrollY = useSharedValue(0);
  const threshold = useSharedValue(Number.POSITIVE_INFINITY);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const progress = useDerivedValue<number>(() => withTiming(scrollY.value >= threshold.value ? 1 : 0, { duration: scrollY.value >= threshold.value ? durationIn : durationOut }));
  return { scrollY, threshold, onScroll, progress };
}

/**
 * The scroll container every shell uses: the ground behind, the content padded under the header (`top`) and clear of the
 * floating bar (`bottom`), and a header drawn over it (the header is absolute, so content scrolls under its fade).
 */
export function ScreenScroll({ header, top, onScroll, bottomPad, healthspan, children }: { header: ReactNode; top: number; onScroll?: ReturnType<typeof useAnimatedScrollHandler>; bottomPad?: number; /** The flat Healthspan ground instead of the gradient. */ healthspan?: boolean; children: ReactNode }) {
  const clearance = useBottomClearance();
  return (
    <View className="flex-1 bg-background">
      <Ground healthspan={healthspan} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: top, paddingBottom: bottomPad ?? clearance }} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never">
        {children}
      </Animated.ScrollView>
      {header}
    </View>
  );
}

