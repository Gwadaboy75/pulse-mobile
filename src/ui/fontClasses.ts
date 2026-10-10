import { LIGHT } from "./palette";

// The pure half of <Text> (Text.tsx): reading the web's font and colour classes off a class string. No React Native
// import, so it is unit-tested in Node (fontClasses.test.ts).

export type Family = "sans" | "numeric";
export type Weight = "regular" | "medium" | "semibold" | "bold";
export type Face = { family: Family; weight: Weight };

export const FACES: Record<Family, Record<Weight, string>> = {
  sans: { regular: "Figtree_400Regular", medium: "Figtree_500Medium", semibold: "Figtree_600SemiBold", bold: "Figtree_700Bold" },
  // Barlow is loaded from 500 up (as on the web), so its "regular" is the medium face.
  numeric: { regular: "Barlow_500Medium", medium: "Barlow_500Medium", semibold: "Barlow_600SemiBold", bold: "Barlow_700Bold" },
};
const WEIGHT_CLASS: Record<string, Weight> = { "font-normal": "regular", "font-medium": "medium", "font-semibold": "semibold", "font-bold": "bold" };
const FAMILY_CLASS: Record<string, Family> = { "font-sans": "sans", "font-numeric": "numeric" };

/** The family and weight a class string asks for, the string without them, and `truncate` / `line-clamp-N` as a line count. */
export function readFont(className: string | undefined, inherited: Face): { face: Face; rest: string; lines?: number } {
  let { family, weight } = inherited;
  let lines: number | undefined;
  const rest: string[] = [];
  for (const token of (className ?? "").split(/\s+/).filter(Boolean)) {
    if (FAMILY_CLASS[token]) family = FAMILY_CLASS[token];
    else if (WEIGHT_CLASS[token]) weight = WEIGHT_CLASS[token];
    else if (token === "truncate") lines = 1;
    else if (/^line-clamp-\d+$/.test(token)) lines = Number(token.slice(11));
    else rest.push(token);
  }
  return { face: { family, weight }, rest: rest.join(" "), lines };
}

// A class that sets the text colour: text-<token> (with an optional /opacity and variant prefixes), text-white, text-[#hex].
const COLOR_CLASS = new RegExp(
  `^(?:[a-z-]+:)*text-(?:${[...Object.keys(LIGHT), "white", "black", "transparent", "current"].join("|")})(?:/[\\d.\\[\\]]+)?$|^(?:[a-z-]+:)*text-\\[(?:#|rgb|hsl|color:|var\\()`,
);

/**
 * The web sets `text-foreground` on <body> and every element inherits it. React Native text inherits only from a parent
 * <Text>, so a top-level <Text> without a colour class of its own gets the foreground.
 */
export const hasColorClass = (className: string) => className.split(/\s+/).some((t) => COLOR_CLASS.test(t));
