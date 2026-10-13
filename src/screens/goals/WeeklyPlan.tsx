// Weekly plan (halo src/screens/home/WeeklyPlanCard.tsx, after WHOOP's Weekly Plan), in the look of Strain's key stat
// rows. The card (on Strain, under the goals): how many of the week's targets are on track beside the title, the plan's
// streak, and a row per target with a ZoneBars-style bar (a tick where an even pace would be), the status word and a
// DeltaMark. It opens the sheet `/weekly-plan?d=`: every target's full row (status and what is left, the week's days as
// grey dots, the last 8 weeks, what the habit is worth on Pulse Age), each a link to its screen.
import { View } from "react-native";
import { CalendarCheck, Dumbbell, Flame, Footprints, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { DAY, formatDay, rangeLabel } from "@/lib/format";
import { getWeeklyPlan, PLAN_KEYS, type PlanKey, type PlanRow, type WeeklyPlanVM } from "@/queries/weeklyPlan";
import { useScreen } from "@/screens/useScreen";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { cn } from "@/ui/cn";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { CAPTION, DeltaMark } from "@/ui/metrics/primitives";
import { goBack, push } from "@/ui/navigate";
import { useSelectedDay } from "@/ui/shells/DateSwitcher";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { TaskPage, TaskSection } from "@/ui/shells/TaskPage";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { GOALS_SETTINGS } from "./Goals";
import { ASIDE, BarLine, GoalRowShell, planColor, UNDER_LABEL, WeekColumns } from "./parts";
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
    <SectionShell
      variant="card"
      title={data ? `Weekly plan · ${titleOf(data).toLowerCase()}` : "Weekly plan"}
      href={`/weekly-plan?d=${day}`}
      aside={data && <Text className={ASIDE}>{`${data.onTrack} of ${data.items.length} on track`}</Text>}
    >
      {data ? (
        <View>
          {streak > 0 && <Text className={cn(CAPTION, "pb-1")}>{streakText(streak)}</Text>}
          <Divided>{data.items.map((it) => <PlanRowCompact key={it.key} it={it} />)}</Divided>
        </View>
      ) : (
        <Divided>
          {keys.map((k) => (
            <View key={k} className="min-h-14 flex-row items-center gap-3 py-2">
              <Icon icon={PLAN_ICON[k]} size={20} tone="muted-foreground" />
              <SkeletonText lh={16} fs={12} className="w-32" />
            </View>
          ))}
        </Divided>
      )}
    </SectionShell>
  );
}

function PlanRowCompact({ it }: { it: PlanRow }) {
  const { c } = useTheme();
  const status = PLAN_STATUS[it.status];
  return (
    <GoalRowShell
      icon={PLAN_ICON[it.key]}
      label={it.short}
      value={planValueText(it)}
      of={planTargetText(it)}
      muted={it.value === null}
      mark={status.mark}
      spoken={`${it.label}: ${planValueText(it)} ${planTargetText(it)}, ${status.word}`}
    >
      <BarLine value={it.progress} color={planColor(c, it.key)} tick={paceOf(it)} caption={status.word} />
    </GoalRowShell>
  );
}

/** The last 8 weeks as small grey squares, oldest first: filled when the target was met, outlined otherwise. */
function WeekDots({ it }: { it: PlanRow }) {
  const met = it.weeks.filter((w) => w.met).length;
  return (
    <View accessible accessibilityLabel={`Met in ${met} of the last ${it.weeks.length} weeks`} className={cn(UNDER_LABEL, "flex-row items-center gap-2")}>
      <Text className={cn(CAPTION, "min-w-0 flex-1")}>{`Last ${it.weeks.length} weeks`}</Text>
      <View className="flex-row gap-1">
        {it.weeks.map((w) => (
          <View key={w.monday} className={cn("size-2 rounded-xs", w.met ? "bg-foreground-secondary" : "border border-border")} />
        ))}
      </View>
    </View>
  );
}

/** One target's full row in the sheet; the head links to its screen. */
function PlanLine({ it, day, onOpen }: { it: PlanRow; day: string; onOpen: () => void }) {
  const { c } = useTheme();
  const age = ageText(it.ageYears);
  const status = PLAN_STATUS[it.status];
  return (
    <View className="gap-2 pb-3">
      <GoalRowShell
        icon={PLAN_ICON[it.key]}
        label={it.label}
        caption={planCaption(it)}
        value={planValueText(it)}
        of={planTargetText(it)}
        muted={it.value === null}
        mark={status.mark}
        spoken={`${it.label}: ${planValueText(it)} ${planTargetText(it)}. ${planCaption(it)}`}
        onPress={onOpen}
      >
        <BarLine value={it.progress} color={planColor(c, it.key)} tick={paceOf(it)} caption={status.word} />
      </GoalRowShell>
      <WeekColumns cols={it.days.map((d) => ({ day: d.day, met: d.met }))} current={day} label={`${it.label}, this week: met on ${it.days.filter((d) => d.met).length} days`} className={UNDER_LABEL} />
      <WeekDots it={it} />
      <View className={cn(UNDER_LABEL, "flex-row items-start gap-2")}>
        <Text className={cn(CAPTION, "min-w-0 flex-1")}>{it.detail}</Text>
        {age && (
          <View className="shrink-0 flex-row items-center gap-1.5">
            <Text className={cn(CAPTION, "font-numeric tabular-nums")}>{`Pulse Age ${age}`}</Text>
            {/* Younger is good: a habit that takes years off points down in the good tone. */}
            <DeltaMark dir={it.ageYears! > 0.05 ? "up" : it.ageYears! < -0.05 ? "down" : "flat"} tone={it.ageYears! > 0.05 ? "bad" : it.ageYears! < -0.05 ? "good" : "neutral"} />
          </View>
        )}
      </View>
    </View>
  );
}

/** The sheet `/weekly-plan?d=` (halo's PlanPage). */
export function WeeklyPlanPageBody() {
  const [day] = useSelectedDay();
  const { keys, data } = usePlanWeek(day);
  const go = (href: string) => {
    goBack();
    push(href);
  };
  return (
    <TaskPage
      title={data ? titleOf(data) : "This week"}
      description={data ? `${rangeLabel(data.monday, data.sunday)} · ${data.onTrack} of ${data.items.length} on track` : undefined}
    >
      <View className="gap-4">
        <Card className="gap-0 px-4 py-1">
          {data ? <PlanList data={data} go={go} /> : <View className="gap-4 py-3">{keys.map((k) => <SkeletonText key={k} lh={26} fs={22} className="w-40" />)}</View>}
        </Card>
        <View className="flex-row gap-3">
          <Button variant="secondary" className="flex-1" onPress={() => go(GOALS_SETTINGS)}>Edit targets</Button>
          <Button variant="secondary" className="flex-1" onPress={() => go("/health/healthspan")}>Pulse Age</Button>
        </View>
      </View>
    </TaskPage>
  );
}

function PlanList({ data, go }: { data: WeeklyPlanVM; go: (href: string) => void }) {
  return (
    <View>
      {data.planStreak.current > 0 && <Text className={cn(CAPTION, "pb-1")}>{streakText(data.planStreak.current)}</Text>}
      <Divided>{data.items.map((it) => <PlanLine key={it.key} it={it} day={data.day} onOpen={() => go(it.href.replace("#", "?section="))} />)}</Divided>
      <View className="mt-5 gap-2">
        <TaskSection>Why these</TaskSection>
        <Text className="text-sm leading-[19px] text-muted-foreground">These are the habits Pulse Age scores. The defaults follow the WHO’s 150 moderate or 75 vigorous minutes and two strength days a week, about 8,000 steps a day, and a steady sleep schedule. A tick on a bar marks where an even pace would be by now.</Text>
      </View>
    </View>
  );
}
