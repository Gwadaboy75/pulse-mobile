// Daily goals (halo src/screens/home/GoalsCard.tsx), on our kit. The card (on Strain, where halo's Activity tab has it):
// "3 of 7 done" beside the title, a two-column grid of tiles, one per goal switched on in Settings › Goals (its icon, name,
// value over target and a bar), then the week's Active Zone Minutes as seven columns. The card opens the sheet `/goals?d=`:
// every goal's full row (value, target, progress, the last 7 days, streak) and a way to Settings › Goals.
import { Fragment, createElement } from "react";
import { View } from "react-native";
import { Check, Moon, Target } from "lucide-react-native";
import { dayLabel, formatValue, MISSING, NBSP } from "@/lib/format";
import { getGoalsDay, GOAL_KEYS, GOAL_META, type GoalKey, type GoalRow, type GoalsWeek } from "@/queries/goals";
import { STAT_ICON } from "@/screens/_lib/view";
import { useScreen } from "@/screens/useScreen";
import { useGoals, type Goals } from "@/state/goals";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { push } from "@/ui/navigate";
import { useSelectedDay } from "@/ui/shells/DateSwitcher";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { SheetScreen, SheetSection } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";
import { useShellCalendar } from "@/ui/shells/ShellStatus";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { Bar, goalColor, WeekColumns, type WeekColumn } from "./parts";

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
    <SectionShell variant="card" title={title} href={`/goals?d=${day}`} aside={data && <Text className="font-numeric text-[13px] font-bold tabular-nums text-foreground-secondary">{`${data.done} of ${data.goals.length} done`}</Text>}>
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-2">{data ? data.goals.map((g) => <GoalTile key={g.key} g={g} />) : keys.map((k) => <TileSkeleton key={k} k={k} />)}</View>
        {data?.week && <WeekStrip week={data.week} dayTarget={goals.targets.azm} />}
      </View>
    </SectionShell>
  );
}

/** One goal: its icon (a check once met, else the percent), the name, value over target, a bar. */
function GoalTile({ g }: { g: GoalRow }) {
  const { c } = useTheme();
  const color = goalColor(c, g.key);
  const pct = g.value === null ? null : Math.round(g.progress * 100);
  return (
    <View accessible accessibilityLabel={`${g.label}: ${valueText(g)} of ${targetText(g)}${g.done ? ", reached" : g.partial ? ", so far today" : ""}`} className="min-w-[45%] flex-1 basis-[45%] gap-2 rounded-xl bg-inset p-3">
      <View className="flex-row items-center justify-between">
        {createElement(goalIcon(g.key), { size: 20, color, strokeWidth: 1.75 })}
        {g.done ? <Icon icon={Check} size={18} tone="optimal-text" strokeWidth={2.5} /> : pct !== null && <Text className="font-numeric text-[13px] font-semibold tabular-nums text-muted-foreground">{`${pct}%`}</Text>}
      </View>
      <Text className="text-[15px] font-semibold leading-5" numberOfLines={1}>{g.short}</Text>
      <Text className="font-numeric text-xl font-bold leading-6 tabular-nums" style={{ color }}>
        {valueText(g)}
        <Text className="text-[13px] font-medium text-muted-foreground">{` / ${targetText(g)}`}</Text>
      </Text>
      <Bar value={g.done ? 1 : g.value === null ? null : g.progress} color={color} className="mt-auto" />
    </View>
  );
}

function TileSkeleton({ k }: { k: GoalKey }) {
  return (
    <View className="min-w-[45%] flex-1 basis-[45%] gap-2 rounded-xl bg-inset p-3">
      <Icon icon={goalIcon(k)} size={20} tone="muted-foreground" />
      <Text className="text-[15px] font-semibold leading-5">{GOAL_META[k].short}</Text>
      <SkeletonText lh={24} fs={20} className="w-24" />
      <Bar value={null} color="transparent" />
    </View>
  );
}

/** The week's Active Zone Minutes: "96 / 150 min" and a column per day, Monday to Sunday, full on days at the daily goal. */
function WeekStrip({ week, dayTarget }: { week: GoalsWeek; dayTarget: number }) {
  const { c } = useTheme();
  const color = goalColor(c, "azm");
  const max = Math.max(dayTarget, 1, ...week.days.map((d) => d.value ?? 0));
  const cols: WeekColumn[] = week.days.map((d) => ({ day: d.day, frac: d.value === null ? null : Math.min(1, d.value / max), met: d.value !== null && d.value >= dayTarget }));
  const total = Math.round(week.total);
  return (
    <View className="gap-3 border-t border-border pt-4">
      <View className="flex-row items-end justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold leading-5">Active Zone Minutes</Text>
          <Text className="text-[13px] leading-[18px] text-muted-foreground">This week, Monday to Sunday</Text>
        </View>
        <Text className="font-numeric text-lg font-bold tabular-nums" style={{ color: week.done ? c["optimal-text"] : color }}>
          {total}
          <Text className="text-[13px] font-medium text-muted-foreground">{` / ${week.target}${NBSP}min`}</Text>
        </Text>
      </View>
      <WeekColumns cols={cols} color={color} height={40} current={week.to} label={`Active Zone Minutes this week: ${total} of ${week.target} minutes`} />
    </View>
  );
}

/** One goal's full row in the sheet: name and streak, value over target, a bar with the percent, the last 7 days. */
function GoalLine({ g }: { g: GoalRow }) {
  const { c } = useTheme();
  const color = goalColor(c, g.key);
  const met = g.history.filter((h) => h.done).length;
  const pct = Math.round(g.progress * 100);
  const caption = g.done ? (g.streak > 1 ? `Reached · ${g.streak}-day streak` : "Reached") : g.streak > 0 ? `${g.streak}-day streak on the line` : `Met ${met} of the last 7 days`;
  return (
    <View className="gap-3 py-4">
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5">{createElement(goalIcon(g.key), { size: 22, color, strokeWidth: 1.75 })}</View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold leading-[21px]">{g.label}</Text>
          <Text className={cn("mt-0.5 text-[13px] leading-[18px]", g.done ? "font-semibold text-optimal-text" : g.streak > 0 ? "font-semibold text-warning-text" : "text-muted-foreground")}>{caption}</Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="font-numeric text-[22px] font-bold leading-[26px] tabular-nums" style={{ color }}>{valueText(g)}</Text>
          <Text className="text-xs font-medium leading-4 text-muted-foreground">{`of ${targetText(g)}`}</Text>
        </View>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} className="flex-row items-center gap-2.5">
        <Bar value={g.done ? 1 : g.progress} color={color} className="flex-1" />
        <Text className={cn("min-w-10 text-right font-numeric text-[13px] font-semibold tabular-nums", g.done ? "text-optimal-text" : "text-muted-foreground")}>{g.value === null ? MISSING : `${pct}%`}</Text>
      </View>
      <WeekColumns cols={g.history.map((h) => ({ day: h.day, frac: h.progress, met: h.done }))} color={color} height={32} current={g.history[g.history.length - 1]?.day ?? ""} label={`${g.label}, last 7 days: met ${met} of 7`} />
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
      {rows.map((g, i) => (
        <Fragment key={g.key}>
          {i > 0 && <View className="h-px bg-border" />}
          <GoalLine g={g} />
        </Fragment>
      ))}
      {week && <WeekStrip week={week} dayTarget={goals.targets.azm} />}
      {off.length > 0 && (
        <View className="mt-5 gap-2">
          <SheetSection>Off</SheetSection>
          <Text className="text-sm leading-[19px] text-muted-foreground">{`${off.map((k) => GOAL_META[k].label).join(", ")}. Switch them on in Settings › Goals.`}</Text>
        </View>
      )}
    </View>
  );
}
