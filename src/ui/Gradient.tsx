import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

let next = 0;

/**
 * A linear gradient filling its parent (the web's bg-linear-to-r / -to-b), for the places a flat colour will not do: the
 * insight card's hairline, the stage swatch. `angle`: "x" runs left to right, "y" top to bottom, "xy" corner to corner
 * (135 degrees). React Native has no CSS gradients and expo-linear-gradient is not installed, so this is a
 * react-native-svg rectangle behind the content; give the parent `overflow-hidden` and a radius.
 */
export function Gradient({ from, to, angle = "x" }: { from: string; to: string; angle?: "x" | "y" | "xy" }) {
  const id = `g${next++}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={angle === "y" ? "0" : "1"} y2={angle === "x" ? "0" : "1"}>
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
