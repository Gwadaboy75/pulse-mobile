// Welcome's one moment (docs/onboarding.md): Home's three rings fill once, in their data colours, so the first screen shows
// what Pulse gives back. They are a picture of the product, not a reading: no numbers, hidden from screen readers. With
// reduce motion on they are drawn full at once.
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { DATA_COLORS, dialColor } from "@/lib/bands";
import { arcPath } from "@/ui/charts/geometry";
import { ARC_FROM, ARC_SWEEP } from "@/ui/metrics/MiniRing";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Home's dial row: an 88 px ring, 6 px thick (spec §11 F2).
const D = 88;
const STROKE = 6;
const R = D / 2 - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** The dial sweep (spec §2.7): 700 ms ease-out. Each ring starts 120 ms after the one before. */
const SWEEP_MS = 700;
const STAGGER_MS = 120;
const START_MS = 200;

// How full each ring is drawn: a good morning, as Home would show it.
const RINGS = [
  { variant: "sleep", label: "Sleep", share: 0.86, colourAt: 86 },
  { variant: "recovery", label: "Recovery", share: 0.78, colourAt: 78 },
  { variant: "strain", label: "Strain", share: 0.55, colourAt: 11.5 },
] as const;

function Ring({ variant, label, share, colourAt, index }: (typeof RINGS)[number] & { index: number }) {
  const { c, css } = useTheme();
  const reduce = useReducedMotion();
  const length = (CIRCUMFERENCE * ARC_SWEEP * share) / 360;
  const hidden = useSharedValue(reduce ? 0 : length);
  useEffect(() => {
    if (reduce) return;
    hidden.value = withDelay(START_MS + index * STAGGER_MS, withTiming(0, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) }));
  }, [hidden, index, reduce]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: hidden.value }));
  return (
    <View className="items-center gap-3">
      <Svg width={D} height={D}>
        <Path d={arcPath(D / 2, D / 2, R, ARC_FROM, ARC_FROM + ARC_SWEEP)} stroke={c["dial-track"]} strokeWidth={STROKE - 0.5} fill="none" />
        {/* Circles start at 3 o'clock: turned so the fill starts where the track does, 4 degrees past 12. */}
        <AnimatedCircle
          cx={D / 2}
          cy={D / 2}
          r={R}
          stroke={css(DATA_COLORS[dialColor(variant, colourAt)].css)}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={[length, CIRCUMFERENCE]}
          animatedProps={props}
          transform={`rotate(${ARC_FROM - 90} ${D / 2} ${D / 2})`}
        />
      </Svg>
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">{label}</Text>
    </View>
  );
}

export function WelcomeRings() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="flex-row justify-center gap-5">
      {RINGS.map((r, i) => (
        <Ring key={r.variant} {...r} index={i} />
      ))}
    </View>
  );
}
