import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The tab bar and the round action are 62 px tall. */
export const TAB_BAR_HEIGHT = 62;

/** How far above the bottom edge the floating bar sits: the safe area less 6 px, never under 12. */
export function useTabBarBottom() {
  return Math.max(useSafeAreaInsets().bottom - 6, 12);
}

/** The room a scrolling screen leaves at its foot so its last content clears the floating bar (the web's `main` padding-bottom). */
export function useBottomClearance() {
  return TAB_BAR_HEIGHT + useTabBarBottom() + 24;
}
