import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";
import { openSheet } from "./sheets";

/** A button that opens a sheet over the current screen (see sheets.ts). */
export function SheetTrigger({ sheet, onPress, children, ...props }: Omit<PressableProps, "children"> & { sheet: string; children: ReactNode; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      onPress={(e) => {
        onPress?.(e);
        openSheet(sheet);
      }}
    >
      {children}
    </Pressable>
  );
}
