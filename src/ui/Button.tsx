import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn } from "./cn";
import { alpha } from "./color";
import { haptic } from "./haptics";
import { Text } from "./Text";
import { useTheme } from "./theme";

// shadcn's Button in Pulse's touch sizes (web: components/ui/button.tsx). Only the variants the kit uses.
type Variant = "default" | "outline" | "secondary" | "ghost" | "outline-pill";
type Size = "touch" | "icon-touch" | "sheet";

// Every web button is `border border-transparent bg-clip-padding`: a 1 px border in the box, the fill inside it. React
// Native paints a background under the border, so the fill is its own view, which an absolute child places inside
// the border (the padding box), with the radius 1 px smaller, as the browser clips it.
const VARIANT: Record<Variant, { box?: string; fill?: string; text: string }> = {
  default: { fill: "bg-primary", text: "text-primary-foreground" },
  // The web's `outline`: border-border bg-background; dark: border-input bg-input/30 (what the Disconnect and Delete confirms use).
  outline: { box: "border-border dark:border-input", fill: "bg-background dark:bg-input/30", text: "text-foreground" },
  secondary: { fill: "bg-secondary", text: "text-secondary-foreground" },
  ghost: { text: "text-foreground" },
  // The second action in sheets and the info card ("Delete", "Open trend view"): ring-1 ring-foreground/70, outside the box (a shadow below).
  "outline-pill": { box: "rounded-full", text: "text-foreground" },
};
const SIZE: Record<Size, { box: string; fill: string; text: string }> = {
  touch: { box: "h-11 gap-2 rounded-xl px-4", fill: "rounded-[11px]", text: "text-[13px] font-bold uppercase tracking-[0.1em]" },
  "icon-touch": { box: "size-11 rounded-full", fill: "rounded-full", text: "" },
  sheet: { box: "h-14 w-full gap-2 rounded-full px-6", fill: "rounded-full", text: "text-[15px] font-bold uppercase tracking-[0.1em]" },
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  onPress?: () => void;
  disabled?: boolean;
  /** A string becomes the label in the variant's text style; anything else (an icon) is drawn as is. */
  children: ReactNode;
  className?: string;
  /** The web colours a button's label with a `text-*` class on the button; a phone's text does not inherit, so it goes here ("text-recovery-red-text"). */
  textClassName?: string;
  accessibilityLabel?: string;
  /** The tap haptic. On by default for actions (the primary variant and sheet buttons); pass false for a button that only navigates. */
  haptic?: boolean;
};

export function Button({ variant = "default", size = "touch", onPress, disabled, children, className, textClassName, accessibilityLabel, haptic: feel = variant === "default" || size === "sheet" }: ButtonProps) {
  const { c } = useTheme();
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (feel) haptic.tap();
        onPress?.();
      }}
      className={cn("flex-row items-center justify-center border border-transparent active:scale-[0.96]", s.box, v.box, disabled && "opacity-50", className)}
      style={variant === "outline-pill" ? { boxShadow: `0 0 0 1px ${alpha(c.foreground, 0.7)}` } : undefined}
    >
      {v.fill && <View pointerEvents="none" className={cn("absolute inset-0", s.fill, v.fill)} />}
      {typeof children === "string" ? <Text className={cn(s.text, v.text, textClassName)}>{children}</Text> : children}
    </Pressable>
  );
}
