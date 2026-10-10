import { createContext, useContext, type ComponentProps } from "react";
import { Platform, Text as RNText, StyleSheet, type TextStyle } from "react-native";
import { cssInterop } from "nativewind";
import { FACES, hasColorClass, readFont, type Face } from "./fontClasses";

// The web app sets type with classes (font-numeric font-bold) and the browser picks the right font file. React Native
// cannot: a custom font is chosen by its exact family name ("Barlow_700Bold"), and fontWeight is ignored or, on
// Android, can even fall back to the system font. So this <Text> reads the font classes off `className`, drops them
// and sets `fontFamily` itself. Nested <Text> inherits the family and weight of its parent unless it names its own,
// as CSS does. Everything else in `className` (size, colour, tracking ...) goes to NativeWind untouched.

/** Ascent plus descent, in em, of both families (Barlow 1.0 + 0.2, Figtree 0.95 + 0.25): the font's own line height. */
const NATURAL = 1.2;

/**
 * iOS lays out a line shorter than the font's own height (`leading-none`, a 64 px numeral on a 64 px line) by keeping
 * the descent and cutting the top, so the glyphs ride up by half the difference. CSS and Android split it evenly above
 * and below (React Native's RCTApplyBaselineOffset returns early in that case; Android's CustomLineHeightSpan halves
 * the leading). This moves such text down by that half, so it sits where the web puts it. It receives the style
 * NativeWind resolved from the classes (cssInterop below), so it sees the real font size and line height.
 */
function IOSText({ style, ...props }: ComponentProps<typeof RNText>) {
  const s = StyleSheet.flatten(style) as TextStyle | undefined;
  const drop = s?.fontSize && s.lineHeight && s.lineHeight < NATURAL * s.fontSize ? (NATURAL * s.fontSize - s.lineHeight) / 2 : 0;
  if (!drop) return <RNText {...props} style={style} />;
  const transform = Array.isArray(s?.transform) ? s.transform : [];
  return <RNText {...props} style={[style, { transform: [...transform, { translateY: drop }] }]} />;
}
cssInterop(IOSText, { className: "style" });
/** The outermost text: a nested <Text> is a span of its parent's layout, so the shift is the parent's alone. */
const OuterText = Platform.OS === "ios" ? IOSText : RNText;

const FaceContext = createContext<Face>({ family: "sans", weight: "regular" });
/** True inside another <Text>: nested text inherits its parent's colour natively, so only the outermost one needs a default. */
const NestedContext = createContext(false);

export function Text({ className, style, numberOfLines, ...props }: ComponentProps<typeof RNText>) {
  const inherited = useContext(FaceContext);
  const nested = useContext(NestedContext);
  const { face, rest, lines, shrink } = readFont(className, inherited);
  const TextBase = nested ? RNText : OuterText;
  return (
    <NestedContext.Provider value>
      <FaceContext.Provider value={face}>
        <TextBase
          {...props}
          className={nested || hasColorClass(rest) ? rest : `${rest} text-foreground`}
          numberOfLines={numberOfLines ?? lines}
          style={[{ fontFamily: FACES[face.family][face.weight], flexShrink: nested ? undefined : shrink }, style]}
        />
      </FaceContext.Provider>
    </NestedContext.Provider>
  );
}
