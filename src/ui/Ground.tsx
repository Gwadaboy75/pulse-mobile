import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { mix } from "./color";
import type { Palette } from "./palette";
import { useTheme } from "./theme";

/**
 * The page ground (spec §2.1): a vertical gradient, background-top to background-mid by 270 px and to background by
 * 740 px, then flat. Drawn behind a screen's content.
 */
export function Ground({ healthspan = false }: { healthspan?: boolean }) {
  const { c, scheme } = useTheme();
  // The Healthspan ground is flat (--ground-healthspan): no gradient.
  const flat = healthspan ? (scheme === "dark" ? "#101518" : "#eef1f3") : null;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        <LinearGradient id="ground" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="740">
          <Stop offset={0} stopColor={flat ?? c["background-top"]} />
          <Stop offset={270 / 740} stopColor={flat ?? c["background-mid"]} />
          <Stop offset={1} stopColor={flat ?? c.background} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#ground)" />
    </Svg>
  );
}

/** The ground's colour at `y` px from the top: what a header's 24 px fade needs to fade from. */
export function groundColorAt(c: Palette, y: number): string {
  if (y >= 740) return c.background;
  if (y >= 270) return mix(c["background-mid"], c.background, 1 - (y - 270) / (740 - 270));
  return mix(c["background-top"], c["background-mid"], 1 - y / 270);
}
