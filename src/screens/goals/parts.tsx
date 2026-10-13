// The pieces the Goals and Weekly plan cards and sheets share (halo src/screens/home/controls.tsx's Capsule and
// WeekColumns), in Pulse's row language after WHOOP's My Plan and journal cards: a thin quiet track, the week as seven
// day circles, a plan summary. Colour is for status only: a met goal or day in the optimal tone, progress in secondary ink.
import { View } from "react-native";
import { Check } from "lucide-react-native";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { CAPTION, LABEL } from "@/ui/metrics/primitives";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";

/** Left inset that lines a track up under a row's label (20 px icon + 12 px gap). */
export const UNDER_LABEL = "ml-8";

/** A 4 px track filled to `value` (0-1; null: empty), optimal once `done`, with an optional tick (0-1) where an even pace would be. */
export function Bar({ value, done, tick, className }: { value: number | null; done?: boolean; tick?: number | null; className?: string }) {
  const { c } = useTheme();
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <View accessibilityElementsHidden className={cn("h-1 justify-center", className)}>
      <View className="h-1 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full" style={{ width: `${v * 100}%`, backgroundColor: done ? c.optimal : c["foreground-secondary"] }} />
      </View>
      {tick != null && tick > 0 && tick < 1 && <View pointerEvents="none" style={{ position: "absolute", left: `${tick * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: c.foreground, opacity: 0.6 }} />}
    </View>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekday = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

export type WeekColumn = { day: string; frac: number | null; met: boolean };

/**
 * The week as WHOOP's journal row (home-11): the day's name over a small circle, a check on optimal on days that met
 * their share, a quiet filled circle on days with some progress, an outline on days with none or no data; `current`'s name in ink.
 */
export function WeekColumns({ cols, current, label, className }: { cols: WeekColumn[]; current: string; label: string; className?: string }) {
  return (
    <View accessible accessibilityLabel={label} className={cn("flex-row", className)}>
      {cols.map((col) => (
        <View key={col.day} className="flex-1 items-center gap-1.5">
          <Text className={cn(LABEL, "text-[10px] leading-3 text-muted-foreground", col.day === current && "text-foreground")}>{DAYS[weekday(col.day)]}</Text>
          <View className={cn("size-5 items-center justify-center rounded-full", col.met ? "bg-optimal" : col.frac ? "bg-muted" : "border border-border")}>
            {col.met && <Icon icon={Check} size={12} tone="background" strokeWidth={3} />}
          </View>
        </View>
      ))}
    </View>
  );
}

/** WHOOP's plan summary (home-12): a big count with an uppercase label ("4 of 6 on track"), a caption, and a thin optimal track. */
export function Summary({ count, of, label, caption }: { count: number; of: number; label: string; caption?: string }) {
  return (
    <View accessible accessibilityLabel={`${count} of ${of} ${label}`} className="gap-2 pb-3">
      {caption && <Text className={CAPTION}>{caption}</Text>}
      <Text>
        <Text className="font-numeric text-xl font-bold leading-6 tabular-nums">{count}</Text>
        <Text className={cn(LABEL, "text-foreground-secondary")}>{` of ${of} ${label}`}</Text>
      </Text>
      <Bar value={of > 0 ? count / of : 0} done />
    </View>
  );
}

/** A row's value, right-aligned in the display font, with "of 10,000" under it as the grey sub-value. */
export function ValueOf({ value, of, muted }: { value: string; of: string; muted?: boolean }) {
  return (
    <View className="shrink-0 items-end">
      <Text className={cn("font-numeric text-xl font-bold leading-6 tabular-nums", muted && "text-muted-foreground")}>{value}</Text>
      <Text className="font-numeric text-[13px] font-medium leading-4 tabular-nums text-muted-foreground">{of}</Text>
    </View>
  );
}
