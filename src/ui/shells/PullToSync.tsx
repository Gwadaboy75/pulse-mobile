import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
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
  const [syncing, setSyncing] = useState(false);
  const run = async () => {
    haptic.tap();
    setSyncing(true);
    try {
      await onRefresh?.();
    } finally {
      setSyncing(false);
    }
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
  return { gesture, indicator: onRefresh ? <PullIndicator pull={pull} syncing={syncing} /> : null };
}

/** The web's indicator: a round chip with the refresh arrows, turning with the pull, spinning while the sync runs. */
function PullIndicator({ pull, syncing }: { pull: SharedValue<number>; syncing: boolean }) {
  const { c } = useTheme();
  const shadow = useShadow();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const sync = useSharedValue(0);
  const turn = useSharedValue(0);
  useEffect(() => {
    sync.value = withTiming(syncing ? 1 : 0, ease);
    if (syncing && !reduce) turn.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
    else {
      cancelAnimation(turn);
      turn.value = 0;
    }
  }, [syncing, reduce, sync, turn]);
  const chip = useAnimatedStyle(() => ({
    opacity: Math.max(sync.value, Math.min(1, pull.value / TRIGGER)),
    transform: [{ translateY: 12 * sync.value + (1 - sync.value) * (pull.value / 2) }],
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${sync.value > 0 ? turn.value : pull.value * 3}deg` }] }));
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
