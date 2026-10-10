import { createContext, useContext } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { mix } from "./color";
import type { Palette } from "./palette";
import { useTheme } from "./theme";

/** The web's --ground stops: background-top to background-mid by `mid` px, to background by `end` px. */
const STOP = { mid: 270, end: 740 } as const;

/** True on a screen with the flat Healthspan ground, so the header painted over it matches (ScreenScroll provides it). */
export const HealthspanGround = createContext(false);

/**
 * The page ground (spec §2.1): a vertical gradient, background-top to background-mid by 270 px and to background by
 * 740 px, then flat. Drawn behind a screen's content. `healthspan` defaults to the screen's (HealthspanGround).
 */
export function Ground({ healthspan }: { healthspan?: boolean }) {
  const { c } = useTheme();
  const screen = useContext(HealthspanGround);
  // The Healthspan ground is flat (--ground-healthspan): no gradient.
  const flat = (healthspan ?? screen) ? c["ground-healthspan"] : null;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        <LinearGradient id="ground" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={STOP.end}>
          <Stop offset={0} stopColor={flat ?? c["background-top"]} />
          <Stop offset={STOP.mid / STOP.end} stopColor={flat ?? c["background-mid"]} />
          <Stop offset={1} stopColor={flat ?? c.background} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#ground)" />
    </Svg>
  );
}

/** The ground's colour at `y` px from the top (`flat`: the Healthspan ground): what a header's 24 px fade needs to fade from. */
export function groundColorAt(c: Palette, y: number, flat?: boolean): string {
  if (flat) return c["ground-healthspan"];
  if (y >= STOP.end) return c.background;
  if (y >= STOP.mid) return mix(c["background-mid"], c.background, 1 - (y - STOP.mid) / (STOP.end - STOP.mid));
  return mix(c["background-top"], c["background-mid"], 1 - y / STOP.mid);
}
