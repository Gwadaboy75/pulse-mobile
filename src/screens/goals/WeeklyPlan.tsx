// Weekly plan (halo src/screens/home/WeeklyPlanCard.tsx, after WHOOP's Weekly Plan), in Pulse's row language. The card
// (on Strain, under the goals): how many of the week's targets are on track, the plan's streak, and a row per target with
// its status chip and a thin track with a tick where an even pace would be. It opens the sheet `/weekly-plan?d=`: every
// target's full row (status and what is left, the week's days, the last 8 weeks, what the habit is worth on Pulse Age),
// each a link to its screen.
import { View } from "react-native";
import { CalendarCheck, ChevronRight, Dumbbell, Flame, Footprints, HeartPulse, Moon, type LucideIcon } from "lucide-react-native";
import { DAY, formatDay, rangeLabel } from "@/lib/format";
import { getWeeklyPlan, PLAN_KEYS, type PlanKey, type PlanRow, type WeeklyPlanVM } from "@/queries/weeklyPlan";
import { useScreen } from "@/screens/useScreen";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Divided } from "@/ui/Divided";
import { Icon } from "@/ui/Icon";
import { CAPTION, LABEL, StatusChip } from "@/ui/metrics/primitives";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";
import { useSelectedDay } from "@/ui/shells/DateSwitcher";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { SheetScreen, SheetSection } from "@/ui/shells/SheetScreen";
import { closeSheet } from "@/ui/shells/sheets";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { GOALS_SETTINGS } from "./Goals";
import { Bar, Summary, UNDER_LABEL, ValueOf, WeekColumns } from "./parts";
import { ageText, PLAN_STATUS, planCaption, planTargetText, planValueText } from "./weeklyPlanView";

export const PLAN_ICON: Record<PlanKey, LucideIcon> = { zone13: HeartPulse, zone45: Flame, strength: Dumbbell, steps: Footprints, consistency: CalendarCheck, sleepNeed: Moon };

/** KeyStatRow's small tile chip: a status word under a row's label. */
const SMALL_CHIP = "min-h-5 px-1.5 py-0.5";

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
    <SectionShell variant="card" title={data ? `Weekly plan · ${titleOf(data).toLowerCase()}` : "Weekly plan"} href={`/weekly-plan?d=${day}`}>
      {data ? (
        <View>
          <Summary count={data.onTrack} of={data.items.length} label="on track" caption={rangeLabel(data.monday, data.sunday)} />
          {streak > 0 && (
            <StatusChip tone="optimal" className="mb-1">
              {streakText(streak)}
            </StatusChip>
          )}
          <Divided>{data.items.map((it) => <PlanRowCompact key={it.key} it={it} />)}</Divided>
        </View>
      ) : (
        <Divided>
          {keys.map((k) => (
            <View key={k} className="min-h-14 flex-row items-center gap-3 py-3">
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
  const status = PLAN_STATUS[it.status];
  return (
    <View accessible accessibilityLabel={`${it.label}: ${planValueText(it)} ${planTargetText(it)}, ${status.word}`} className="gap-2 py-3">
      <View className="flex-row items-center gap-3">
        <Icon icon={PLAN_ICON[it.key]} size={20} tone="muted-foreground" />
        <View className="min-w-0 flex-1 items-start">
          <Text className={LABEL} numberOfLines={1}>{it.short}</Text>
          <StatusChip tone={status.chip} className={cn(SMALL_CHIP, "mt-1")} textClassName="text-[11px]">
            {status.word}
          </StatusChip>
        </View>
        <ValueOf value={planValueText(it)} of={planTargetText(it)} muted={it.value === null} />
      </View>
      <Bar value={it.progress} done={it.done} tick={paceOf(it)} className={UNDER_LABEL} />
    </View>
  );
}

/** The last 8 weeks as small squares, oldest first: optimal when the target was met, outlined without data. */
function WeekDots({ it }: { it: PlanRow }) {
  const met = it.weeks.filter((w) => w.met).length;
  return (
    <View accessible accessibilityLabel={`Met in ${met} of the last ${it.weeks.length} weeks`} className={cn(UNDER_LABEL, "flex-row items-center gap-2")}>
      <Text className={cn(CAPTION, "min-w-0 flex-1")}>{`Last ${it.weeks.length} weeks`}</Text>
      <View className="flex-row gap-1">
        {it.weeks.map((w) => (
          <View key={w.monday} className={cn("size-2.5 rounded-xs", w.met ? "bg-optimal" : w.value === null ? "border border-border" : "bg-muted")} />
        ))}
      </View>
    </View>
  );
}

/** One target's full row in the sheet; the head links to its screen. */
function PlanLine({ it, day, onOpen }: { it: PlanRow; day: string; onOpen: () => void }) {
  const age = ageText(it.ageYears);
  const status = PLAN_STATUS[it.status];
  const frac = (v: number | null, met: boolean) => (v === null ? null : it.key === "sleepNeed" || it.key === "consistency" ? (met ? 1 : 0.4) : Math.min(1, v / Math.max(1, ...it.days.map((d) => d.value ?? 0))));
  return (
    <View className="gap-3 py-4">
      <Press activeBg="bg-fill-pressed" accessibilityRole="link" accessibilityLabel={`${it.label}: ${planValueText(it)} ${planTargetText(it)}. ${planCaption(it)}`} onPress={onOpen} className="-mx-2 flex-row items-center gap-3 rounded-xl px-2 py-1">
        <Icon icon={PLAN_ICON[it.key]} size={20} tone="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Text className={LABEL}>{it.label}</Text>
          <Text className={cn(CAPTION, "mt-0.5")}>{planCaption(it)}</Text>
        </View>
        <ValueOf value={planValueText(it)} of={planTargetText(it)} muted={it.value === null} />
        <Icon icon={ChevronRight} size={16} tone="muted-foreground" />
      </Press>
      <View className={cn(UNDER_LABEL, "flex-row items-center gap-2.5")}>
        <Bar value={it.progress} done={it.done} tick={paceOf(it)} className="flex-1" />
        <StatusChip tone={status.chip} className={SMALL_CHIP} textClassName="text-[11px]">
          {status.word}
        </StatusChip>
      </View>
      <WeekColumns cols={it.days.map((d) => ({ day: d.day, frac: frac(d.value, d.met), met: d.met }))} current={day} label={`${it.label}, this week: met on ${it.days.filter((d) => d.met).length} days`} className={UNDER_LABEL} />
      <WeekDots it={it} />
      <View className={cn(UNDER_LABEL, "flex-row items-start gap-2")}>
        <Text className={cn(CAPTION, "min-w-0 flex-1")}>{it.detail}</Text>
        {age && (
          <StatusChip tone={it.ageYears! > 0.05 ? "warning" : it.ageYears! < -0.05 ? "optimal" : "neutral"} className={cn(SMALL_CHIP, "shrink-0")} textClassName="text-[11px]">
            {`Pulse Age ${age}`}
          </StatusChip>
        )}
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
      {data.planStreak.current > 0 && (
        <StatusChip tone="optimal" className="mb-1">
          {streakText(data.planStreak.current)}
        </StatusChip>
      )}
      <Divided>{data.items.map((it) => <PlanLine key={it.key} it={it} day={data.day} onOpen={() => go(it.href.replace("#", "?section="))} />)}</Divided>
      <View className="mt-5 gap-2">
        <SheetSection>Why these</SheetSection>
        <Text className="text-sm leading-[19px] text-muted-foreground">These are the habits Pulse Age scores. The defaults follow the WHO’s 150 moderate or 75 vigorous minutes and two strength days a week, about 8,000 steps a day, and a steady sleep schedule. A tick on a bar marks where an even pace would be by now.</Text>
      </View>
    </View>
  );
}
