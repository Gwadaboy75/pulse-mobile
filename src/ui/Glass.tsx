import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { alpha } from "./color";
import { Gradient } from "./Gradient";
import { useTheme } from "./theme";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * Glass bar material (spec §2.6), for chrome that floats over scrolling content only: the tab bar and the round action. A
 * labelled approximation of iOS Liquid Glass: near-opaque gradient fill, lit top edge, faint rim, soft lower shadow.
 * The web also blurs what is behind (backdrop-filter); the blur needs expo-blur, which this app does not install, so the
 * fill here is the sampled solid colours (the web's own fallback when blur is unavailable or transparency is reduced).
 */
export function Glass({ radius, action, children, style, ...props }: ViewProps & { radius: number; /** The indigo-tinted fill of the round action. */ action?: boolean; children?: ReactNode }) {
  const { c, scheme } = useTheme();
  const shadow = scheme === "dark" ? "0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35)" : "0 10px 30px rgba(16, 21, 24, 0.12), 0 2px 6px rgba(16, 21, 24, 0.08)";
  const rim = action ? alpha(c["action-rim-from"], 0.25) : c["glass-rim"];
  return (
    <View style={[{ borderRadius: radius, boxShadow: shadow }, style]} {...props}>
      <View style={{ ...FILL, borderRadius: radius, overflow: "hidden" }}>
        <Gradient from={action ? c["glass-action-top"] : c["glass-top"]} to={action ? c["glass-action-bottom"] : c["glass-bottom"]} angle="y" />
      </View>
      {/* The lit top edge and the faint rim, over the fill. */}
      <View pointerEvents="none" style={{ ...FILL, borderRadius: radius, boxShadow: `inset 0 1px 0 ${c["glass-edge"]}, inset 0 0 0 1px ${rim}` }} />
      {children}
    </View>
  );
}
