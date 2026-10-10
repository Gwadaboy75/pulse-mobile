import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetView, type BottomSheetBackdropProps, type BottomSheetBackgroundProps } from "@gorhom/bottom-sheet";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { alpha } from "../color";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { DoneScreen } from "./DoneScreen";

export type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Stacked full-width actions: `Button size="sheet"` (white primary, then `variant="outline-pill"`). */
  footer?: ReactNode;
  /** "screen": the reference app's full-screen task (Journal, Customize Dashboard): the whole phone. */
  size?: "default" | "tall" | "screen";
  /** Screen only: the header's right-hand control (the Journal's pencil). */
  action?: ReactNode;
  /** Screen only: the sand glow at the top that fades into the sheet (the Journal). */
  glow?: boolean;
  /** Screen only: replaces the sheet's content with a confirmation ("Saved", "Success"), then calls `onDone`. */
  done?: { title: string; body: string; onDone: () => void } | null;
};

/** A caps section label with a hairline running to the edge, as the reference app's "TIME ───". Use inside a sheet. */
export function SheetSection({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-muted-foreground">{children}</Text>
      <View className="h-px flex-1 bg-foreground/10" />
    </View>
  );
}

/** The sheet material (spec §2.6): opaque dark gradient from `sheet` to `sheet-bottom`, a lit top edge. Not glass. */
function SheetBackground({ style, glow }: BottomSheetBackgroundProps & { glow?: boolean }) {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={[style, { overflow: "hidden" }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="sheet" x1="0" y1="0" x2="0" y2="1">
            <Stop offset={0} stopColor={glow ? c["glow-sand"] : c.sheet} />
            <Stop offset={glow ? 0.45 : 0.001} stopColor={c.sheet} />
            <Stop offset={1} stopColor={c["sheet-bottom"]} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sheet)" />
      </Svg>
    </View>
  );
}

/**
 * Tasks (check-in, vital and contributor detail): a bottom sheet (spec §4.8). X at the right, centred caps title,
 * white pill actions. The web's Vaul drawer is @gorhom/bottom-sheet here; the web's side-sheet-from-768px is not
 * needed on a phone. Controlled, like the web one: `open` presents it, a swipe down or a tap on the dim calls
 * `onOpenChange(false)`. Needs <BottomSheetModalProvider> above it (src/ui/providers.tsx).
 */
export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer, size = "default", action, glow, done }: ResponsiveSheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const screen = size === "screen";

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const backdrop = (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={scheme === "dark" ? 0.65 : 0.45} pressBehavior="close" />;

  const header = (
    <View className="flex-row items-center gap-2 px-2 pb-3 pt-1">
      <View className="w-11" />
      <View className="flex-1 items-center">
        <Text accessibilityRole="header" className="text-center text-[15px] font-bold uppercase leading-5 tracking-[0.1em]">
          {title}
        </Text>
        {description && <Text className="mt-0.5 text-center text-xs font-medium leading-4 text-muted-foreground">{description}</Text>}
      </View>
      {/* X at the right everywhere, where people look for it (2026-10-04, spec §4.8); `action` takes its place on a screen. */}
      {screen && action ? (
        action
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => onOpenChange(false)} className="size-11 items-center justify-center rounded-full active:bg-foreground/8">
          <X size={22} color={c.foreground} strokeWidth={1.75} />
        </Pressable>
      )}
    </View>
  );
  const foot = footer && <View className="gap-3 px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>{footer}</View>;
  const body = done ? (
    <DoneScreen {...done} />
  ) : (
    <>
      {header}
      {size === "default" ? (
        <View className="px-4 pb-4">{children}</View>
      ) : (
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>{children}</BottomSheetScrollView>
      )}
      {foot}
    </>
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={() => onOpenChange(false)}
      enablePanDownToClose
      backdropComponent={backdrop}
      backgroundComponent={(p) => <SheetBackground {...p} glow={glow && !done} />}
      handleIndicatorStyle={{ width: 40, height: 6, backgroundColor: alpha(c.foreground, 0.25) }}
      handleStyle={screen ? { display: "none" } : undefined}
      topInset={insets.top}
      // size: default fits its content (up to 92 % of the screen); tall and screen are fixed heights.
      enableDynamicSizing={size === "default"}
      maxDynamicContentSize={height * 0.92}
      snapPoints={size === "default" ? undefined : [screen ? "100%" : "92%"]}
    >
      {size === "default" ? <BottomSheetView>{body}</BottomSheetView> : <BottomSheetView style={{ flex: 1, paddingTop: screen ? 8 : 0 }}>{body}</BottomSheetView>}
    </BottomSheetModal>
  );
}
