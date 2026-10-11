import { RefreshCw } from "lucide-react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { haptic } from "../haptics";
import { DURATION, EASE } from "../motion";
import { ring, useShadow } from "../shadow";
import { useTheme } from "../theme";

// The web's pull to sync (pulse src/components/shells/AppLifecycle.tsx): pull distance is half the finger's travel, a
// pull of TRIGGER starts a sync, and the indicator follows the finger up to MAX.
const TRIGGER = 64;
const MAX = 96;
const ease = { duration: DURATION.fast, easing: EASE.standard };

/**
 * Pull down at the top of a scroll view to run `onRefresh`. Returns a pan gesture to run alongside the scroll view's
 * native gesture, and the indicator to draw over the screen. The pull counts only when the finger lands while the
 * view is at the top, as on the web.
 */
export function usePullToSync(offset: SharedValue<number>, onRefresh?: () => void | Promise<unknown>) {
  const pull = useSharedValue(0);
  const armed = useSharedValue(false);
  const run = () => {
    haptic.tap();
    void onRefresh?.();
  };
  const gesture = Gesture.Pan()
    .enabled(!!onRefresh)
    // Only a downward drag: a sideways one (a chart's scrub) or an upward one (a scroll) never becomes a pull.
    .activeOffsetY(10)
    .failOffsetX([-15, 15])
    .onBegin(() => {
      armed.value = offset.value <= 0;
    })
    .onUpdate((e) => {
      if (armed.value) pull.value = Math.max(0, Math.min(e.translationY / 2, MAX));
    })
    .onFinalize(() => {
      const fire = armed.value && pull.value >= TRIGGER;
      armed.value = false;
      pull.value = withTiming(0, ease);
      if (fire) runOnJS(run)();
    });
  return { gesture, indicator: onRefresh ? <PullIndicator pull={pull} /> : null };
}

/**
 * The web's indicator: a round chip with the refresh arrows, turning with the pull. It leaves as the finger lifts: the
 * band's ring in the header shows the sync from there (owner's call; the web keeps the chip spinning).
 */
function PullIndicator({ pull }: { pull: SharedValue<number> }) {
  const { c } = useTheme();
  const shadow = useShadow();
  const insets = useSafeAreaInsets();
  const chip = useAnimatedStyle(() => ({
    opacity: Math.min(1, pull.value / TRIGGER),
    transform: [{ translateY: pull.value / 2 }],
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${pull.value * 3}deg` }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", top: insets.top + 8, alignSelf: "center", zIndex: 40, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c["background-mid"], boxShadow: shadow("overlay", ring(c.border, { inset: false })) }, chip]}
    >
      <Animated.View style={icon}>
        <RefreshCw size={16} strokeWidth={2} color={c.foreground} />
      </Animated.View>
    </Animated.View>
  );
}
