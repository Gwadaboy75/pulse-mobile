// Weekly plan (halo src/screens/home/WeeklyPlanCard.tsx, after WHOOP's Weekly Plan), on our kit. The card (on Strain,
// under the goals): how many of the week's targets are on track, the plan's streak, and each target's bar with a tick
// where an even pace would be. It opens the sheet `/weekly-plan?d=`: every target's full row (status and what is left,
// the week's days, the last 8 weeks, what the habit is worth on Pulse Age), each a link to its screen.
import { Fragment, createElement } from "react";
import { View } from "react-native";
import { CalendarCheck, Dumbbell, Flame, Footprints, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { DAY, formatDay, rangeLabel } from "@/lib/format";
import { getWeeklyPlan, PLAN_KEYS, type PlanKey, type PlanRow, type WeeklyPlanVM } from "@/queries/weeklyPlan";
import { useScreen } from "@/screens/useScreen";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Button } from "@/ui/Button";
import { alpha } from "@/ui/color";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";
import { useSelectedDay } from "@/ui/shells/DateSwitcher";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { SheetScreen, SheetSection } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { GOALS_SETTINGS } from "./Goals";
import { Bar, planColor, WeekColumns } from "./parts";
import { ageText, PLAN_STATUS, planCaption, planTargetText, planValueText } from "./weeklyPlanView";

export const PLAN_ICON: Record<PlanKey, LucideIcon> = { zone13: HeartPulse, zone45: Flame, strength: Dumbbell, steps: Footprints, consistency: CalendarCheck, sleepNeed: Moon };

const titleOf = (vm: { isCurrentWeek: boolean; monday: string }) => (vm.isCurrentWeek ? "This week" : `Week of ${formatDay(vm.monday, DAY.monthDay)}`);
const streakText = (weeks: number) => (weeks === 1 ? "Every target met last week" : `Every target met ${weeks} weeks running`);
/** Where an even pace would be by now, on [0, 1]; null once done or missed. */
const paceOf = (it: PlanRow) => (it.expected !== null && it.status !== "done" && it.status !== "missed" && it.target > 0 ? Math.min(1, it.expected / it.target) : null);

/** The week holding `day`, once the phone's plan is read (the defaults would show the wrong targets until then). */
function usePlanWeek(day: string) {
  const { plan, ready } = useWeeklyPlan();
  const { data } = useScreen((ctx) => (ready ? getWeeklyPlan(day, ctx, plan) : Promise.resolve(null)), ["weeklyPlan", day, plan, ready]);
  return { keys: PLAN_KEYS.filter((k) => plan.enabled[k]), ready, data: data && data.day === day ? data : undefined };
}

/** Strain's Weekly plan card. */
export function WeeklyPlanCard({ day }: { day: string }) {
  const { keys, ready, data } = usePlanWeek(day);
  if (ready && keys.length === 0)
    return (
      <SectionShell variant="card" title="Weekly plan">
        <EmptyState body="No weekly targets switched on." action={{ label: "Set weekly targets", href: GOALS_SETTINGS }} />
      </SectionShell>
    );
  const streak = data?.planStreak.current ?? 0;
  return (
    <SectionShell variant="card" title={data ? `Weekly plan · ${titleOf(data).toLowerCase()}` : "Weekly plan"} href={`/weekly-plan?d=${day}`} aside={data && <Text className="font-numeric text-[13px] font-bold tabular-nums text-foreground-secondary">{`${data.onTrack} of ${data.items.length} on track`}</Text>}>
      {data ? (
        <View className="gap-3">
          {streak > 0 && <Text className="text-[13px] font-semibold leading-[18px] text-optimal-text">{streakText(streak)}</Text>}
          {data.items.map((it) => <PlanRowCompact key={it.key} it={it} />)}
        </View>
      ) : (
        <View className="gap-3">{keys.map((k) => <SkeletonText key={k} lh={20} fs={15} className="w-48" />)}</View>
      )}
    </SectionShell>
  );
}

function PlanRowCompact({ it }: { it: PlanRow }) {
  const { c } = useTheme();
  const color = planColor(c, it.key);
  return (
    <View accessible accessibilityLabel={`${it.label}: ${planValueText(it)} ${planTargetText(it)}, ${PLAN_STATUS[it.status].word}`} className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Icon icon={PLAN_ICON[it.key]} size={16} tone="muted-foreground" />
        <Text className="min-w-0 flex-1 text-[14px] font-semibold leading-5" numberOfLines={1}>{it.short}</Text>
        <Text className="font-numeric text-[14px] font-bold tabular-nums">
          {planValueText(it)}
          <Text className="text-xs font-medium text-muted-foreground">{` ${planTargetText(it)}`}</Text>
        </Text>
        <Text className={cn("w-14 text-right text-xs font-bold", PLAN_STATUS[it.status].tone)}>{PLAN_STATUS[it.status].word}</Text>
      </View>
      <Bar value={it.progress} color={it.done ? color : alpha(color, 0.85)} tick={paceOf(it)} />
    </View>
  );
}

/** The last 8 weeks as dots, oldest first: filled when the target was met. */
function WeekDots({ it, color }: { it: PlanRow; color: string }) {
  const { c } = useTheme();
  const met = it.weeks.filter((w) => w.met).length;
  return (
    <View accessible accessibilityLabel={`Met in ${met} of the last ${it.weeks.length} weeks`} className="flex-row items-center gap-2">
      <Text className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">{`Last ${it.weeks.length} weeks`}</Text>
      <View className="flex-row gap-1">
        {it.weeks.map((w) => (
          <View key={w.monday} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: w.met ? color : "transparent", borderWidth: 2, borderColor: w.met ? color : w.value === null ? c.border : alpha(color, 0.45) }} />
        ))}
      </View>
    </View>
  );
}

/** One target's full row in the sheet; the head links to its screen. */
function PlanLine({ it, day, onOpen }: { it: PlanRow; day: string; onOpen: () => void }) {
  const { c } = useTheme();
  const color = planColor(c, it.key);
  const age = ageText(it.ageYears);
  const quiet = it.status === "on_pace" || it.status === "no_data";
  const frac = (v: number | null, met: boolean) => (v === null ? null : it.key === "sleepNeed" || it.key === "consistency" ? (met ? 1 : 0.4) : Math.min(1, v / Math.max(1, ...it.days.map((d) => d.value ?? 0))));
  return (
    <View className="gap-3 py-4">
      <Press activeBg="bg-fill-pressed" accessibilityRole="link" accessibilityLabel={`${it.label}: ${planValueText(it)} ${planTargetText(it)}. ${planCaption(it)}`} onPress={onOpen} className="-mx-2 flex-row items-start gap-3 rounded-xl px-2 py-1">
        <View className="mt-0.5">{createElement(PLAN_ICON[it.key], { size: 22, color, strokeWidth: 1.75 })}</View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold leading-[21px]">{it.label}</Text>
          <Text className={cn("mt-0.5 text-[13px] leading-[18px]", quiet ? "text-muted-foreground" : cn("font-semibold", PLAN_STATUS[it.status].tone))}>{planCaption(it)}</Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="font-numeric text-[22px] font-bold leading-[26px] tabular-nums" style={{ color }}>{planValueText(it)}</Text>
          <Text className="text-xs font-medium leading-4 text-muted-foreground">{planTargetText(it)}</Text>
        </View>
      </Press>
      <View className="flex-row items-center gap-2.5">
        <Bar value={it.progress} color={it.done ? color : alpha(color, 0.85)} tick={paceOf(it)} className="flex-1" />
        <Text className={cn("w-14 text-right text-xs font-bold", PLAN_STATUS[it.status].tone)}>{PLAN_STATUS[it.status].word}</Text>
      </View>
      <WeekColumns cols={it.days.map((d) => ({ day: d.day, frac: frac(d.value, d.met), met: d.met }))} color={color} height={32} current={day} label={`${it.label}, this week: met on ${it.days.filter((d) => d.met).length} days`} />
      <WeekDots it={it} color={color} />
      <View className="flex-row items-start gap-2">
        <Text className="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">{it.detail}</Text>
        {age && <Text className={cn("shrink-0 font-numeric text-[13px] font-semibold tabular-nums", it.ageYears! > 0.05 ? "text-warning-text" : it.ageYears! < -0.05 ? "text-optimal-text" : "text-muted-foreground")}>{`Pulse Age ${age}`}</Text>}
      </View>
    </View>
  );
}

/** The sheet `/weekly-plan?d=` (halo's PlanSheet). */
export function WeeklyPlanSheetBody() {
  const [day] = useSelectedDay();
  const { keys, data } = usePlanWeek(day);
  const go = (href: string) => {
    closeSheet();
    push(href);
  };
  return (
    <SheetScreen
      title={data ? titleOf(data) : "This week"}
      description={data ? `${rangeLabel(data.monday, data.sunday)} · ${data.onTrack} of ${data.items.length} on track` : undefined}
      footer={
        <>
          <Button size="sheet" onPress={() => go(GOALS_SETTINGS)}>Edit weekly targets</Button>
          <Button size="sheet" variant="outline-pill" onPress={() => go("/health/healthspan")}>Open Pulse Age</Button>
        </>
      }
    >
      <View className="px-4">{data ? <PlanList data={data} go={go} /> : <View className="gap-4 py-2">{keys.map((k) => <SkeletonText key={k} lh={26} fs={22} className="w-40" />)}</View>}</View>
    </SheetScreen>
  );
}

function PlanList({ data, go }: { data: WeeklyPlanVM; go: (href: string) => void }) {
  return (
    <View>
      {data.planStreak.current > 0 && <Text className="pb-3 text-[15px] font-semibold leading-[22px] text-optimal-text">{streakText(data.planStreak.current)}</Text>}
      {data.items.map((it, i) => (
        <Fragment key={it.key}>
          {i > 0 && <View className="h-px bg-border" />}
          <PlanLine it={it} day={data.day} onOpen={() => go(it.href.replace("#", "?section="))} />
        </Fragment>
      ))}
      <View className="mt-5 gap-2">
        <SheetSection>Why these</SheetSection>
        <Text className="text-sm leading-[19px] text-muted-foreground">These are the habits Pulse Age scores. The defaults follow the WHO’s 150 moderate or 75 vigorous minutes and two strength days a week, about 8,000 steps a day, and a steady sleep schedule. A tick on a bar marks where an even pace would be by now.</Text>
      </View>
    </View>
  );
}
