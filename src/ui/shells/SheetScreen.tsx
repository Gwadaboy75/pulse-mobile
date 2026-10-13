import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dimensions, Keyboard, LayoutAnimation, Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ground } from "../Ground";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { alpha } from "../color";
import { DetailHeader, DetailHeaderRow, detailRowHeight } from "./DetailHeader";
import { DoneScreen } from "./DoneScreen";
import { HEADER_FADE, useHeaderHeight } from "./Header";
import { closeSheet } from "./sheets";

export type SheetScreenProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Stacked full-width actions: `Button size="sheet"` (white primary, then `variant="outline-pill"`), pinned above the navigation bar. */
  footer?: ReactNode;
  /** The header's right-hand control (the Journal's pencil), opposite Back. */
  action?: ReactNode;
  /** The sand glow at the top that fades into the ground, under an X (the Journal, as WHOOP's journal page). */
  glow?: boolean;
  /** What Back does where a page asks first (the Journal's "Dismiss journal?"): the web's `onOpenChange(false)`. Default: close. */
  onClose?: () => void;
  /** Replaces the page's content with a confirmation ("Saved", "Success"), then calls `onDone` (usually `closeSheet`). */
  done?: { title: string; body: string; onDone: () => void } | null;
};

/** A caps section label with a hairline running to the edge, as the reference app's "TIME ───". Use inside a sheet. */
export function SheetSection({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-muted-foreground">{children}</Text>
      <View className="h-px flex-1 bg-fill-pressed" />
    </View>
  );
}

/** iOS: how much of the screen the keyboard covers, which lifts the page's body and actions clear of it. Android resizes the window itself. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const sub = Keyboard.addListener("keyboardWillChangeFrame", (e) => {
      LayoutAnimation.configureNext({ duration: Math.max(e.duration, 10), update: { duration: Math.max(e.duration, 10), type: LayoutAnimation.Types.keyboard } });
      setHeight(Math.max(Dimensions.get("screen").height - e.endCoordinates.screenY, 0));
    });
    return () => sub.remove();
  }, []);
  return height;
}

/**
 * The scrolling body's props that bring the focused field into view once the keyboard is up (the body has just shrunk
 * above it), 16 pt clear of the actions, as a browser scrolls a focused input into view.
 */
function useRevealFocused() {
  const ref = useRef<ScrollView>(null);
  const view = useRef({ y: 0, height: 0 });
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      const input = TextInput.State.currentlyFocusedInput();
      // `getInnerViewRef` (the content container) is in ScrollView.js but missing from its .d.ts.
      const content = (ref.current as unknown as { getInnerViewRef(): View | null } | null)?.getInnerViewRef();
      if (!input || !content) return;
      input.measureLayout(content, (_x, y, _w, h) => {
        const { y: top, height } = view.current;
        if (y + h + 16 > top + height) ref.current?.scrollTo({ y: y + h + 16 - height });
        else if (y < top) ref.current?.scrollTo({ y: Math.max(y - 16, 0) });
      });
    });
    return () => sub.remove();
  }, []);
  return {
    ref,
    scrollEventThrottle: 16,
    onLayout: (e: LayoutChangeEvent) => (view.current.height = e.nativeEvent.layout.height),
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => (view.current.y = e.nativeEvent.contentOffset.y),
  };
}

/**
 * A task page (spec §4.8). What the web shows in a drawer (check-in, the logs, the info cards) is a full-screen page here,
 * pushed like any detail page (sheets.ts): the detail header (Back, the caps title, `action`) over the ground, the
 * scrolling body, and the pill actions pinned above the navigation bar. The keyboard lifts the body and the actions.
 */
export function SheetScreen({ title, description, children, footer, action, glow, done, onClose }: SheetScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const reveal = useRevealFocused();
  const rows = detailRowHeight({ subtitle: description });
  const framed = useHeaderHeight(rows);
  // A glow page keeps its header in the flow over the glow (the detail header's ground fill would cover the glow).
  const top = glow ? 0 : framed;
  const header = { title, subtitle: description, action, onBack: onClose ?? closeSheet };
  // The web's bottom padding, `pb-[max(env(safe-area-inset-bottom),16px)]`, under the actions or, with none, under the
  // body: the navigation bar's inset, so the actions sit above the gesture bar. Above the keyboard: 16 pt.
  const pad = keyboard ? 16 : Math.max(insets.bottom, 16);

  return (
    <View style={[styles.fill, { backgroundColor: c.background, paddingBottom: keyboard }]}>
      <Ground />
      {glow && <LinearGradient pointerEvents="none" colors={[c["glow-sand"], alpha(c["glow-sand"], 0)]} style={[StyleSheet.absoluteFill, { bottom: "55%" }]} />}
      {glow && (
        <View style={{ paddingTop: insets.top }}>
          <DetailHeaderRow {...header} dismiss="close" />
        </View>
      )}
      {done ? (
        <View style={[styles.fill, { paddingTop: top }]}>
          <DoneScreen {...done} />
        </View>
      ) : (
        <>
          <ScrollView {...reveal} style={styles.fill} contentContainerStyle={{ paddingTop: glow ? 8 : top + HEADER_FADE, paddingHorizontal: 16, paddingBottom: footer ? 16 : pad }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer && <View className="gap-3 px-4 pt-3" style={{ paddingBottom: pad }}>{footer}</View>}
        </>
      )}
      {!glow && <DetailHeader {...header} />}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
