import { Image } from "react-native";
import { useTheme } from "./theme";

// Health Connect's official product icon (developer.android.com, Health Connect UI guidelines › Assets: 192 px PNGs; no
// SVG is published). The colour icon on light grounds; on the dark ground its navy half disappears, so the white one.
const COLOUR = require("../../assets/images/health-connect.png");
const WHITE = require("../../assets/images/health-connect-white.png");

export function HealthConnectMark({ size = 20 }: { size?: number }) {
  const { scheme } = useTheme();
  return <Image source={scheme === "dark" ? WHITE : COLOUR} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}
