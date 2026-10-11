// Activity Cost (what each kind of workout costs next-morning Recovery, and how long it takes to come back) and detected
// activities (sustained raised heart rate with no workout recorded), from halo src/screens/detail/ActivityCost.tsx (its
// fields and copy) drawn with Pulse's kit. The wording lives in src/queries/activityCost.ts.
import { View } from "react-native";
import { Activity } from "lucide-react-native";
import { clock, formatValue, MISSING } from "@/lib/format";
import { baselineText, bounceText, costCaption, costSentence, costTone, costValue } from "@/queries/activityCost";
import type { ActivityCostEntry, ActivityCostVM, ActivityVM, DetectedItem } from "@/queries/types";
import { Card, SECONDARY_ROW } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { ACTIVITY_ICON } from "@/ui/icons";
import { CAPTION, LABEL } from "@/ui/metrics/primitives";
import { Text } from "@/ui/Text";

const CAVEAT = "Averages over your history, not proof of cause.";
const TONE: Record<ReturnType<typeof costTone>, string> = { cost: "text-recovery-red-text", lift: "text-optimal-text", flat: "text-foreground-secondary" };

function CostRow({ e, minSessions }: { e: ActivityCostEntry; minSessions: number }) {
  const value = costValue(e);
  const caption = costCaption(e, minSessions);
  return (
    <View accessible accessibilityLabel={`${e.name}: ${value ? `${value} next-morning Recovery. ` : ""}${caption}`} className="min-h-14 flex-row items-center gap-3 py-2">
      <Icon icon={ACTIVITY_ICON[e.kind]} size={20} tone="muted-foreground" strokeWidth={1.75} />
      <View className="min-w-0 flex-1">
        <Text className={LABEL}>{e.name}</Text>
        <Text className={cn(CAPTION, "mt-0.5")}>{caption}</Text>
      </View>
      <Text className={cn("font-numeric text-xl font-bold leading-6 tabular-nums", value ? TONE[costTone(e)] : "text-muted-foreground")}>{value ?? MISSING}</Text>
    </View>
  );
}

/** Activities' "Recovery cost": a row per kind (`items`, all by default), then what they are measured against. */
export function ActivityCostList({ vm, items = vm.items }: { vm: ActivityCostVM; items?: ActivityCostEntry[] }) {
  const base = baselineText(vm);
  return (
    <Card className="gap-0 px-4 py-1">
      <Divided>
        {items.map((e) => (
          <CostRow key={e.kind} e={e} minSessions={vm.minSessions} />
        ))}
      </Divided>
      <Text className={cn(CAPTION, "pb-3 pt-1")}>{base ? `${base}. ${CAVEAT}` : CAVEAT}</Text>
    </Card>
  );
}

/** The Activity screen's card: this kind's cost, the morning after this workout, and the baseline. */
export function ActivityCostCard({ cost }: { cost: NonNullable<ActivityVM["cost"]> }) {
  const e = cost.item;
  const value = costValue(e);
  const rows: [string, string][] = [];
  if (cost.nextMorning !== null) rows.push(["Recovery after this one", `${formatValue("int", cost.nextMorning)}%`]);
  // Only a dip has a bounce-back; the sentence says what a lift or no change means.
  if (costTone(e) === "cost") rows.push(["Typical bounce-back", bounceText(e)]);
  rows.push([cost.baselineKind === "rest" ? "Rest-day Recovery" : "Average Recovery", cost.baseline === null ? MISSING : `${formatValue("int", cost.baseline)}%`]);
  return (
    <Card className="gap-3 px-4 py-4">
      {value !== null && (
        <View accessible accessibilityLabel={`${value} next-morning Recovery`} className="gap-1">
          <Text className={cn("font-numeric text-4xl font-bold leading-10 tabular-nums", TONE[costTone(e)])}>{value}</Text>
          <Text className={cn(LABEL, "text-muted-foreground")}>Next-morning Recovery</Text>
        </View>
      )}
      <Text className="text-[15px] leading-[22px] text-foreground-secondary">{costSentence(e, cost)}</Text>
      <Divided>
        {rows.map(([k, v]) => (
          <View key={k} accessible accessibilityLabel={`${k}: ${v}`} className="min-h-11 flex-row items-center justify-between gap-3 py-2">
            <Text className="min-w-0 flex-1 text-[15px] leading-5 text-foreground-body">{k}</Text>
            <Text className="shrink text-right font-numeric text-base font-bold leading-5 tabular-nums">{v}</Text>
          </View>
        ))}
      </Divided>
      <Text className={CAPTION}>{CAVEAT}</Text>
    </Card>
  );
}

/**
 * A detected activity among the day's rows: the timeline row's shape (spec §5.12) with a dashed, unfilled chip and a
 * muted name, and no detail screen to open. Shown for reference only.
 */
export function DetectedRow({ item, timeZone }: { item: DetectedItem; timeZone?: string }) {
  const s = clock(item.start, timeZone);
  const e = clock(item.end, timeZone);
  const steps = item.steps ? ` · ${formatValue("grouped", item.steps)} steps` : "";
  return (
    <View
      accessible
      accessibilityLabel={`Detected activity, likely ${item.label.toLowerCase()}, average heart rate ${item.avgHr} bpm, ${s} to ${e}. Not a recorded workout.`}
      className={cn(SECONDARY_ROW, "h-14 flex-row items-center gap-3 pl-1.5 pr-3")}
    >
      <View className="h-11 w-[84px] shrink-0 flex-row items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-strain">
        <Icon icon={item.kind === "cardio" ? Activity : ACTIVITY_ICON[item.kind]} size={16} tone="strain-text" strokeWidth={1.75} />
        <Text className="font-numeric text-xl font-bold tabular-nums text-strain-text">{formatValue("decimal1", item.strain)}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold uppercase leading-5 tracking-[0.1em] text-foreground-secondary">Detected</Text>
        <Text className="text-xs font-medium leading-4 text-muted-foreground" numberOfLines={1}>{`${item.label} · ${item.avgHr} bpm avg${steps}`}</Text>
      </View>
      <View className="shrink-0 items-end">
        <Text className="font-numeric text-xs font-medium leading-4 tabular-nums text-foreground-secondary">{s}</Text>
        <Text className="font-numeric text-xs font-medium leading-4 tabular-nums text-foreground-secondary">{e}</Text>
      </View>
    </View>
  );
}

export const DETECTED_NOTE =
  "Detected activity: 12 minutes or more of raised heart rate with no workout recorded, labelled from your steps. It is shown for reference and adds nothing to your scores.";
