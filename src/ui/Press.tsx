import type { ReactNode, Ref } from "react";
import { Pressable, StyleSheet, type PressableProps, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { cn } from "./cn";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The web's `duration-150 ease-standard` (globals.css `--ease-standard`). */
const EASE = { duration: 150, easing: Easing.bezier(0.2, 0, 0, 1) };
/** iOS's own scroll views wait about this long before a touch counts as a press (`delaysContentTouches`). */
const PRESS_DELAY_MS = 150;

export type PressProps = Omit<PressableProps, "style" | "children"> & {
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  ref?: Ref<View>;
  /** Pressed scale, the web's `active:scale-[x]`. */
  activeScale?: number;
  /** Pressed fill as a background class, the web's `active:bg-*` ("bg-accent", "bg-fill-hover" for its bg-foreground/8). */
  activeBg?: string;
  /** Pressed opacity, for the few text links that dim instead of scaling. */
  activeOpacity?: number;
};

/**
 * The kit's pressable: the web's `transition-[scale,background-color] duration-150 ease-standard` with `active:` states,
 * run on the UI thread. A touch only counts as pressed after PRESS_DELAY_MS, so a finger that lands on a card and then
 * scrolls never shows the press. A tap shorter than that still plays the full press in and out.
 *
 * React Native cannot ease a background class, so the pressed fill is a view behind the children in that class, faded
 * in; it copies the pressable's `rounded-*` classes to keep its shape.
 */
export function Press({ className, style, activeScale = 1, activeBg, activeOpacity = 1, onPressIn, onPressOut, children, ...props }: PressProps) {
  const p = useSharedValue(0);
  // Only the animated properties: an opacity of 1 here would override a class's `opacity-disabled`.
  const animated = useAnimatedStyle(() => ({
    ...(activeOpacity !== 1 && { opacity: interpolate(p.value, [0, 1], [1, activeOpacity]) }),
    ...(activeScale !== 1 && { transform: [{ scale: interpolate(p.value, [0, 1], [1, activeScale]) }] }),
  }));
  const fill = useAnimatedStyle(() => ({ opacity: p.value }));
  const rounded = className?.split(/\s+/).filter((k) => /^(?:[\w-]+:)?rounded/.test(k)).join(" ");
  return (
    <AnimatedPressable
      unstable_pressDelay={PRESS_DELAY_MS}
      onPressIn={(e) => {
        p.set(withTiming(1, EASE));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // A quick tap gets its press-in at release (after the delay): finish going in, then come back out.
        p.set(withSequence(withTiming(1, { ...EASE, duration: EASE.duration * (1 - p.get()) }), withTiming(0, EASE)));
        onPressOut?.(e);
      }}
      className={className}
      style={[style, animated]}
      {...props}
    >
      {activeBg && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fill]}>
          <View className={cn("flex-1", rounded, activeBg)} />
        </Animated.View>
      )}
      {children}
    </AnimatedPressable>
  );
}
