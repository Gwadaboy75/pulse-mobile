// The pieces the Goals and Weekly plan cards and sheets share (halo src/screens/home/controls.tsx's Capsule and
// WeekColumns), built from our tokens: an 8 px bar, the week as seven rounded columns, and each goal's colour.
import { View } from "react-native";
import type { GoalKey } from "@/queries/goals";
import type { PlanKey } from "@/queries/weeklyPlan";
import { alpha } from "@/ui/color";
import { cn } from "@/ui/cn";
import type { Palette } from "@/ui/palette";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";

/** A goal's colour by family: activity Strain's blue, sleep Sleep's, water the recovery blue. */
export const goalColor = (c: Palette, key: GoalKey) => (key === "sleep" ? c.sleep : key === "water" ? c["recovery-blue"] : c.strain);
/** A weekly target's colour: training Strain's blue, steps the activity chart's, sleep Sleep's. */
export const planColor = (c: Palette, key: PlanKey) => (key === "consistency" || key === "sleepNeed" ? c.sleep : key === "steps" ? c["chart-1"] : c.strain);

/** An 8 px bar filled to `value` (0-1; null: empty track), with an optional tick (0-1) where an even pace would be. */
export function Bar({ value, color, tick, className }: { value: number | null; color: string; tick?: number | null; className?: string }) {
  const { c } = useTheme();
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <View className={cn("h-2 justify-center", className)}>
      <View className="h-2 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full" style={{ width: `${v * 100}%`, backgroundColor: color }} />
      </View>
      {tick != null && tick > 0 && tick < 1 && <View pointerEvents="none" style={{ position: "absolute", left: `${tick * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: c.foreground, opacity: 0.6 }} />}
    </View>
  );
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const weekday = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

export type WeekColumn = { day: string; frac: number | null; met: boolean };

/** Seven rounded columns, one per day: full colour on days that met their share, faded otherwise; `current`'s letter in ink. */
export function WeekColumns({ cols, color, height, current, label }: { cols: WeekColumn[]; color: string; height: number; current: string; label: string }) {
  return (
    <View accessible accessibilityLabel={label} className="flex-row gap-1.5">
      {cols.map((col) => (
        <View key={col.day} className="flex-1 items-center gap-1">
          <View className="w-full max-w-6 justify-end overflow-hidden rounded-md bg-muted" style={{ height }}>
            {col.frac !== null && col.frac > 0 && <View className="w-full rounded-md" style={{ height: Math.max(4, col.frac * height), backgroundColor: col.met ? color : alpha(color, 0.4) }} />}
          </View>
          <Text className={cn("text-[11px] font-semibold leading-[14px]", col.day === current ? "text-foreground" : "text-muted-foreground")}>{LETTERS[weekday(col.day)]}</Text>
        </View>
      ))}
    </View>
  );
}
