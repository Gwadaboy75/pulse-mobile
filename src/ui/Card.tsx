import { createContext, useContext } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { cn } from "./cn";
import { useTheme } from "./theme";

/**
 * The opaque card material (spec §2.6): 16 px corners, a top hairline (dark) or a 1 px ring and soft shadow (light).
 * The web also fades the fill 2-4 % lighter toward its top (a gradient); a phone card here is the flat `card` colour,
 * since the difference is a few RGB steps and a gradient needs another native module.
 */
export const CARD_CLASS = "rounded-2xl bg-card";

/** True inside a <Card>: a row in a card steps down to a flat secondary row (the web's `in-data-[slot=card]:`), no card in a card. */
const InCard = createContext(false);
export const useInCard = () => useContext(InCard);

export function useCardStyle(): ViewStyle & { boxShadow: string } {
  const { c, scheme } = useTheme();
  return {
    boxShadow: scheme === "dark" ? `inset 0 1px 0 ${c["card-edge"]}` : "0 1px 2px rgba(16, 21, 24, 0.05), 0 0 0 1px rgba(16, 21, 24, 0.05)",
  };
}

export function Card({ className, style, ...props }: ViewProps & { style?: StyleProp<ViewStyle> }) {
  const shadow = useCardStyle();
  return (
    <InCard.Provider value>
      <View className={cn(CARD_CLASS, "overflow-hidden py-4", className)} style={[shadow, style]} {...props} />
    </InCard.Provider>
  );
}
