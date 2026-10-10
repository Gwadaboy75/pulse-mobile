import { useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { todayIn } from "@/lib/url";
import { ShellCalendarProvider } from "./shells/ShellStatus";

/**
 * What the kit's components need above them, once, at the root:
 * - GestureHandlerRootView: gestures (chart scrubbing, bottom sheets) only work inside one.
 * - SafeAreaProvider: the headers and the floating bar read the notch and home-indicator insets.
 * - BottomSheetModalProvider: where bottom sheets (ResponsiveSheet) are drawn.
 * - ShellCalendarProvider: today, the first day with data and the time zone, for the date switcher and the charts. The
 *   value here is the device's today with no first day; the data layer replaces it once the database is read.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [calendar] = useState(() => ({ today: todayIn() }));
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ShellCalendarProvider value={calendar}>
          <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
        </ShellCalendarProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
