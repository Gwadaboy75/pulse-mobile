// Daily goals (halo src/screens/home/GoalsCard.tsx), in Pulse's row language. The card (on Strain, where halo's Activity
// tab has it): "3 of 7 done" beside the title, a row per goal switched on in Settings › Goals (its icon, label, value over
// target and a thin track, or a check once met), then the week's Active Zone Minutes as a row over seven small squares.
// The card opens the sheet `/goals?d=`: every goal's full row (value, target, progress, the last 7 days, streak) and a
// way to Settings › Goals.
import { View } from "react-native";
import { Check, Moon, Target } from "lucide-react-native";
import { dayLabel, formatValue, MISSING, NBSP } from "@/lib/format";
import { getGoalsDay, GOAL_KEYS, GOAL_META, type GoalKey, type GoalRow, type GoalsWeek } from "@/queries/goals";
import { STAT_ICON } from "@/screens/_lib/view";
import { useScreen } from "@/screens/useScreen";
import { useGoals, type Goals } from "@/state/goals";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { CAPTION, LABEL, StatusChip } from "@/ui/metrics/primitives";
import { push } from "@/ui/navigate";
import { useSelectedDay } from "@/ui/shells/DateSwitcher";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { SheetScreen, SheetSection } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";
import { useShellCalendar } from "@/ui/shells/ShellStatus";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { Bar, Summary, UNDER_LABEL, ValueOf, WeekColumns, type WeekColumn } from "./parts";

export const GOALS_SETTINGS = "/settings?s=goals";

const goalIcon = (key: GoalKey) => (key === "sleep" ? Moon : STAT_ICON[key]) ?? Target;
const unitOf = (g: { unit?: string }) => (g.unit ? `${NBSP}${g.unit}` : "");
const valueText = (g: Pick<GoalRow, "format" | "value">) => (g.value === null ? MISSING : formatValue(g.format, g.value));
const targetText = (g: Pick<GoalRow, "format" | "target" | "unit">) => `${formatValue(g.format, g.target)}${unitOf(g)}`;

/** The day's goals, scored once the phone's goals are read (the defaults would score the day wrongly until then). */
function useGoalsDay(day: string) {
  const { goals, ready } = useGoals();
  const { data } = useScreen((ctx) => (ready ? getGoalsDay(day, ctx, goals) : Promise.resolve(null)), ["goals", day, goals, ready]);
  return { goals, ready, data: data && data.day === day ? data : undefined };
}

/** Strain's goals card. `day` is the day on show. */
export function GoalsCard({ day, isToday }: { day: string; isToday: boolean }) {
  const { goals, ready, data } = useGoalsDay(day);
  const keys = GOAL_KEYS.filter((k) => goals.enabled[k]);
  const title = isToday ? "Today’s goals" : "Goals";
  if (ready && keys.length === 0)
    return (
      <SectionShell variant="card" title={title}>
        <EmptyState body="No goals switched on." action={{ label: "Set goals", href: GOALS_SETTINGS }} />
      </SectionShell>
    );
  return (
    <SectionShell variant="card" title={title} href={`/goals?d=${day}`}>
      {data && <Summary count={data.done} of={data.goals.length} label="done" />}
      <Divided>
        {data ? data.goals.map((g) => <GoalRowCompact key={g.key} g={g} />) : keys.map((k) => <RowSkeleton key={k} k={k} />)}
        {data?.week && <WeekStrip week={data.week} dayTarget={goals.targets.azm} />}
      </Divided>
    </SectionShell>
  );
}

/** A check in a fixed slot after the value, so values line up whether or not a goal is met. */
function DoneSlot({ done }: { done: boolean }) {
  return <View className="w-4 items-center">{done && <Icon icon={Check} size={16} tone="optimal-text" strokeWidth={2.5} />}</View>;
}

/** One goal: icon, label and percent, value over target, then a thin track under the label (a check once met). */
function GoalRowCompact({ g }: { g: GoalRow }) {
  const pct = g.value === null ? null : Math.round(g.progress * 100);
  return (
    <View accessible accessibilityLabel={`${g.label}: ${valueText(g)} of ${targetText(g)}${g.done ? ", reached" : g.partial ? ", so far today" : ""}`} className="gap-2 py-3">
      <View className="flex-row items-center gap-3">
        <Icon icon={goalIcon(g.key)} size={20} tone="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text className={LABEL} numberOfLines={1}>{g.short}</Text>
          {pct !== null && !g.done && <Text className={cn(CAPTION, "mt-0.5 font-numeric tabular-nums")}>{`${pct}%`}</Text>}
        </View>
        <ValueOf value={valueText(g)} of={`of ${targetText(g)}`} muted={g.value === null} />
        <DoneSlot done={g.done} />
      </View>
      {!g.done && <Bar value={g.value === null ? null : g.progress} className={UNDER_LABEL} />}
    </View>
  );
}

function RowSkeleton({ k }: { k: GoalKey }) {
  return (
    <View className="min-h-14 flex-row items-center gap-3 py-3">
      <Icon icon={goalIcon(k)} size={20} tone="muted-foreground" />
      <Text className={cn(LABEL, "min-w-0 flex-1")} numberOfLines={1}>{GOAL_META[k].short}</Text>
      <SkeletonText lh={24} fs={20} className="w-16" />
    </View>
  );
}

/** The week's Active Zone Minutes as a row ("96 of 150 min"), then a square per day, Monday to Sunday, met on days at the daily goal. */
function WeekStrip({ week, dayTarget }: { week: GoalsWeek; dayTarget: number }) {
  const max = Math.max(dayTarget, 1, ...week.days.map((d) => d.value ?? 0));
  const cols: WeekColumn[] = week.days.map((d) => ({ day: d.day, frac: d.value === null ? null : Math.min(1, d.value / max), met: d.value !== null && d.value >= dayTarget }));
  const total = Math.round(week.total);
  return (
    <View className="gap-3 py-3">
      <View accessible accessibilityLabel={`Active Zone Minutes this week: ${total} of ${week.target} minutes${week.done ? ", reached" : ""}`} className="flex-row items-center gap-3">
        <Icon icon={goalIcon("azm")} size={20} tone="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text className={LABEL}>Active Zone Minutes</Text>
          <Text className={cn(CAPTION, "mt-0.5")}>This week, Monday to Sunday</Text>
        </View>
        <ValueOf value={String(total)} of={`of ${week.target}${NBSP}min`} />
        <DoneSlot done={week.done} />
      </View>
      <WeekColumns cols={cols} current={week.to} label={`Active Zone Minutes, days at the daily goal: ${cols.filter((d) => d.met).length} of ${cols.length}`} className={UNDER_LABEL} />
    </View>
  );
}

/** One goal's full row in the sheet: label and its standing, value over target, a track with the percent, the last 7 days. */
function GoalLine({ g }: { g: GoalRow }) {
  const met = g.history.filter((h) => h.done).length;
  const pct = Math.round(g.progress * 100);
  const caption = g.done ? (g.streak > 1 ? `Reached · ${g.streak}-day streak` : "Reached") : g.streak > 0 ? `${g.streak}-day streak on the line` : `Met ${met} of the last 7 days`;
  return (
    <View className="gap-3 py-4">
      <View className="flex-row items-center gap-3">
        <Icon icon={goalIcon(g.key)} size={20} tone="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text className={LABEL}>{g.label}</Text>
          {g.done || g.streak > 0 ? (
            <StatusChip tone={g.done ? "optimal" : "warning"} className="mt-1">
              {caption}
            </StatusChip>
          ) : (
            <Text className={cn(CAPTION, "mt-0.5")}>{caption}</Text>
          )}
        </View>
        <ValueOf value={valueText(g)} of={`of ${targetText(g)}`} muted={g.value === null} />
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} className={cn(UNDER_LABEL, "flex-row items-center gap-2.5")}>
        <Bar value={g.done ? 1 : g.progress} done={g.done} className="flex-1" />
        <Text className={cn(CAPTION, "min-w-10 text-right font-numeric tabular-nums")}>{g.value === null ? MISSING : `${pct}%`}</Text>
      </View>
      <WeekColumns cols={g.history.map((h) => ({ day: h.day, frac: h.progress, met: h.done }))} current={g.history[g.history.length - 1]?.day ?? ""} label={`${g.label}, last 7 days: met ${met} of 7`} className={UNDER_LABEL} />
    </View>
  );
}

/** The sheet `/goals?d=` (halo's GoalsSheet). */
export function GoalsSheetBody() {
  const [day] = useSelectedDay();
  const { today } = useShellCalendar();
  const { goals, data } = useGoalsDay(day);
  const edit = () => {
    closeSheet();
    push(GOALS_SETTINGS);
  };
  return (
    <SheetScreen title="Goals" description={dayLabel(day, today)} footer={<Button size="sheet" onPress={edit}>Edit goals</Button>}>
      <View className="px-4">{data ? <GoalsList goals={goals} rows={data.goals} week={data.week} /> : <View className="gap-4 py-2">{GOAL_KEYS.filter((k) => goals.enabled[k]).map((k) => <SkeletonText key={k} lh={26} fs={22} className="w-40" />)}</View>}</View>
    </SheetScreen>
  );
}

function GoalsList({ goals, rows, week }: { goals: Goals; rows: GoalRow[]; week: GoalsWeek | null }) {
  const off = GOAL_KEYS.filter((k) => !goals.enabled[k]);
  return (
    <View>
      <Divided>
        {rows.map((g) => <GoalLine key={g.key} g={g} />)}
        {week && <WeekStrip week={week} dayTarget={goals.targets.azm} />}
      </Divided>
      {off.length > 0 && (
        <View className="mt-5 gap-2">
          <SheetSection>Off</SheetSection>
          <Text className="text-sm leading-[19px] text-muted-foreground">{`${off.map((k) => GOAL_META[k].label).join(", ")}. Switch them on in Settings › Goals.`}</Text>
        </View>
      )}
    </View>
  );
}
