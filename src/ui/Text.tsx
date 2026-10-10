import { createContext, useContext, type ComponentProps } from "react";
import { Text as RNText } from "react-native";
import { FACES, hasColorClass, readFont, type Face } from "./fontClasses";

// The web app sets type with classes (font-numeric font-bold) and the browser picks the right font file. React Native
// cannot: a custom font is chosen by its exact family name ("Barlow_700Bold"), and fontWeight is ignored or, on
// Android, can even fall back to the system font. So this <Text> reads the font classes off `className`, drops them
// and sets `fontFamily` itself. Nested <Text> inherits the family and weight of its parent unless it names its own,
// as CSS does. Everything else in `className` (size, colour, tracking ...) goes to NativeWind untouched.

const FaceContext = createContext<Face>({ family: "sans", weight: "regular" });
/** True inside another <Text>: nested text inherits its parent's colour natively, so only the outermost one needs a default. */
const NestedContext = createContext(false);

export function Text({ className, style, numberOfLines, ...props }: ComponentProps<typeof RNText>) {
  const inherited = useContext(FaceContext);
  const nested = useContext(NestedContext);
  const { face, rest, lines } = readFont(className, inherited);
  return (
    <NestedContext.Provider value>
      <FaceContext.Provider value={face}>
        <RNText
          {...props}
          className={nested || hasColorClass(rest) ? rest : `${rest} text-foreground`}
          numberOfLines={numberOfLines ?? lines}
          style={[{ fontFamily: FACES[face.family][face.weight] }, style]}
        />
      </FaceContext.Provider>
    </NestedContext.Provider>
  );
}
