import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dimensions, Keyboard, LayoutAnimation, Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { alpha } from "../color";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { DoneScreen } from "./DoneScreen";
import { closeSheet, type SheetSize } from "./sheets";
import { Press } from "../Press";

export type SheetScreenProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Stacked full-width actions: `Button size="sheet"` (white primary, then `variant="outline-pill"`). */
  footer?: ReactNode;
  /** The size the route was registered with in app/_layout.tsx (`sheetOptions(size)`); see sheets.ts. */
  size?: SheetSize;
  /** Screen only: the header's right-hand control (the Journal's pencil), opposite the X, which stays at the left. */
  action?: ReactNode;
  /** Screen only: the sand glow at the top that fades into the sheet (the Journal). */
  glow?: boolean;
  /** What the X does where a sheet asks first (the Journal's "Dismiss journal?"): the web's `onOpenChange(false)`. Default: close. */
  onClose?: () => void;
  /** Replaces the sheet's content with a confirmation ("Saved", "Success"), then calls `onDone` (usually `closeSheet`). */
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

/**
 * iOS: how much of the screen the keyboard covers. A sheet's content ends at (or just above) the bottom of the screen, so
 * this is what lifts its body and actions clear of the keyboard. React Native's KeyboardAvoidingView measured its frame
 * inside the sheet, not on the screen, and lifted the Profile sheet 70 pt short. Android resizes the window itself.
 */
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
 * The content of a sheet route (spec §4.8). The frame (drag, detents, dim, corners, dismissal) is the platform's, set
 * by `sheetOptions` in app/_layout.tsx; this draws what is inside: the opaque dark gradient from `sheet` to
 * `sheet-bottom` (spec §2.6: not glass), the centred caps title with the X (at the right on a drawer, at the left on a screen), the body and pinned pill
 * actions. A route renders it once as its whole content. The keyboard lifts the body and the actions.
 */
export function SheetScreen({ title, description, children, footer, size = "default", action, glow, done, onClose }: SheetScreenProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const reveal = useRevealFocused();
  const fit = size === "default";
  const screen = size === "screen";
  // A content-height sheet hugs its content up to the web drawer's `max-h-[92svh]`, here also the most iOS lets a
  // fitToContents sheet's content take (the screen less both insets, measured), and its body scrolls beyond. When the
  // keyboard comes up iOS raises the sheet to its full height (the screen less the top inset, measured) and leaves the
  // content at the top, so the content takes that height and the actions stay above the keyboard, as in the taller sheets.
  const screenHeight = Dimensions.get("screen").height;
  const hug = fit && !keyboard;
  // The web's bottom padding, `pb-[max(env(safe-area-inset-bottom),16px)]`, under the actions or, with none, under the body.
  // On iOS a fitToContents sheet already adds the home indicator's band below its content (measured: 34 pt), so it adds
  // only what that band lacks of 16 pt. Above the keyboard: 16 pt.
  const pad = keyboard ? 16 : fit && Platform.OS === "ios" ? Math.max(16 - insets.bottom, 0) : Math.max(insets.bottom, 16);

  const close = (
    <Press activeBg="bg-fill-hover" accessibilityRole="button" accessibilityLabel="Close" onPress={onClose ?? closeSheet} className="size-11 items-center justify-center rounded-full">
      <X size={22} color={c.foreground} strokeWidth={1.75} />
    </Press>
  );
  // The web's header is a grid of 44 / 1fr / 44 (ResponsiveSheet.tsx): a drawer keeps the X at the right; the full-screen task
  // keeps it at the left and puts its `action` (the Journal's pencil) at the right, with the same 8 px above and below.
  const header = (
    <View className={screen ? "flex-row items-center gap-2 px-2 py-2" : "flex-row items-center gap-2 px-2 pb-3 pt-1"}>
      {screen ? close : <View className="w-11" />}
      <View className="flex-1 items-center">
        <Text accessibilityRole="header" className="text-center text-[15px] font-bold uppercase leading-5 tracking-[0.1em]">
          {title}
        </Text>
        {description && <Text className="mt-0.5 text-center text-xs font-medium leading-4 text-muted-foreground">{description}</Text>}
      </View>
      {screen ? action ?? <View className="w-11" /> : close}
    </View>
  );
  // The web's body is `px-4 pb-4` in a drawer and `px-4 pb-6` on a screen, then the actions; with no actions the body ends
  // with the bottom padding itself.
  const bodyBottom = footer ? (screen ? 24 : 16) : pad;

  return (
    // `collapsable={false}` keeps the root in the native tree. Flattened, the body's ScrollView became a direct child of
    // react-native-screens' form-sheet content wrapper beside the handle and the header, and on iOS the library then set
    // the ScrollView's frame to the whole sheet (RNSScreen `correctScrollViewFrame`, legacy fallback), drawing the body
    // over the header. Measured: Yoga put the ScrollView at y 88, the screen showed it at 0.
    <View
      collapsable={false}
      style={
        hug
          ? { maxHeight: Math.min(screenHeight * 0.92, screenHeight - insets.top - insets.bottom) }
          : [styles.fill, { paddingBottom: keyboard }, fit && { height: screenHeight - insets.top }]
      }
    >
      {/* The fill is painted by the sheet's own content, over the native frame's plain background. */}
      <LinearGradient
        pointerEvents="none"
        colors={[glow && !done ? c["glow-sand"] : c.sheet, c.sheet, c["sheet-bottom"]]}
        locations={[0, glow && !done ? 0.45 : 0.001, 1]}
        style={StyleSheet.absoluteFill}
      />
      {screen && <StatusBar style={scheme === "dark" ? "light" : "dark"} />}
      {/* The web drawer's handle on both platforms: 40 × 6, 10 px from the top, foreground at 25 % (the system grabber is off). */}
      {!screen && <View className="mt-2.5 h-1.5 w-10 self-center rounded-full" style={{ backgroundColor: alpha(c.foreground, 0.25) }} />}
      {/* A screen is `presentation: "modal"`: on iOS a page-sheet card that already starts below the status bar (React
          Navigation's own header drops the top inset for iOS modals too), so only Android's full-screen modal needs it. */}
      <View style={[hug ? styles.shrink : styles.grow, { paddingTop: screen ? (Platform.OS === "ios" ? 0 : insets.top) : 8 }]}>
        {done ? (
          <View style={fit ? styles.doneFit : styles.fill}>
            <DoneScreen {...done} />
          </View>
        ) : (
          <>
            {header}
            <ScrollView {...reveal} style={hug ? styles.shrink : styles.grow} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bodyBottom }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {footer && <View className="gap-3 px-4 pt-3" style={{ paddingBottom: pad }}>{footer}</View>}
          </>
        )}
      </View>
    </View>
  );
}

// `shrink` and `grow` spell out all three flex values: a body switched from `shrink` to `flex: 1` when the keyboard came
// up kept its content height (measured: 464 pt where 288 were free) and pushed the actions under the keyboard.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexGrow: 0, flexShrink: 1, flexBasis: "auto" },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  doneFit: { height: 320 },
});
