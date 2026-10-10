import { useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "./cn";
import { placeMenu, type Box } from "./menuPlace";
import { Panel } from "./Panel";

/** A dropdown's trigger: put `ref` on the trigger view (collapsable={false}); `open` measures it and shows the panel. */
export function useMenu() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Box | null>(null);
  return {
    ref,
    anchor,
    // On Android, measureInWindow measures from below the status bar, while the translucent modal starts at the top of the screen.
    open: () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y: y + (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0), w, h })),
    close: () => setAnchor(null),
  };
}

/**
 * The web's dropdown panel (shadcn DropdownMenuContent with MENU_PANEL): rounded-2xl bg-popover p-1.5, a 1 px
 * foreground/10 ring and the overlay shadow, 8 px below the trigger and aligned to it (`start`, `end`, or `stretch` for
 * the trigger's width). Like Radix, it flips above only when it does not fit below and fits better above, and it never
 * covers its trigger. A tap outside closes it; there is no dim.
 *
 * The trigger and the modal's own root are both measured in window coordinates, and the panel is placed at the difference.
 */
export function MenuPanel({ anchor, onClose, align, className, children }: { anchor: Box | null; onClose: () => void; align: "start" | "end" | "stretch"; className?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const root = useRef<View>(null);
  const [frame, setFrame] = useState<Box | null>(null);
  const [panel, setPanel] = useState<{ w: number; h: number } | null>(null);

  const place = anchor && frame && panel ? placeMenu(anchor, frame, panel, insets, align) : null;

  return (
    <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable
        ref={root}
        collapsable={false}
        accessibilityLabel="Close menu"
        onPress={onClose}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          root.current?.measureInWindow((x, y) => setFrame({ x, y, w: width, h: height }));
        }}
        className="flex-1"
      >
        {anchor && (
          <Panel
            ringOutside
            // The panel swallows taps, so only outside it closes the menu.
            onStartShouldSetResponder={() => true}
            onLayout={(e) => setPanel({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            className={cn("absolute rounded-2xl p-1.5", className)}
            style={place ?? { left: 0, top: 0, width: align === "stretch" ? anchor.w : undefined, opacity: 0 }}
          >
            {children}
          </Panel>
        )}
      </Pressable>
    </Modal>
  );
}
