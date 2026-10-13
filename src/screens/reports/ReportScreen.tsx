// Reports `/reports/[period]` (web: (app)/reports/[period]/page.tsx, loading.tsx; spec §7.13, journey 8): `YYYY-Www` or
// `YYYY-MM`.
import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react-native";
import type { PlanTargets } from "@/core/algorithms/weeklyPlan";
import type { DataColor } from "@/lib/bands";
import { DAY, formatDay, formatValue, rangeLabel } from "@/lib/format";
import { dayHref } from "@/lib/url";
import { todayOf } from "@/queries/common";
import { latestReport } from "@/queries/home";
import { getReport, type ReportPageVM } from "@/queries/reports";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Button } from "@/ui/Button";
import type { KeyStat, ReportVM } from "@/queries/types";
import { Divided, LoadError } from "@/screens/trends/parts";
import { useScreen } from "@/screens/useScreen";
import { CAPTION, LABEL } from "@/screens/_lib/view";
import { ZoneBars, ZoneBarsSkeleton } from "@/ui/charts/ZoneBars";
import { cn } from "@/ui/cn";
import { SEGMENT, SEGMENT_ON } from "@/ui/Segmented";
import { haptic } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { DriverList, DriverListSkeleton } from "@/ui/metrics/DriverList";
import { InsightCard, InsightCardSkeleton } from "@/ui/metrics/InsightCard";
import { KeyStatRow, KeyStatRowSkeleton } from "@/ui/metrics/KeyStatRow";
import { MetricTags } from "@/ui/metrics/primitives";
import { ScoreDial, ScoreDialSkeleton } from "@/ui/metrics/ScoreDial";
import { DetailShell } from "@/ui/shells/DetailShell";
import { EmptyState } from "@/ui/shells/EmptyState";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Skeleton, SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { push } from "@/ui/navigate";
import { Press } from "@/ui/Press";
import { reportShareText, STAT_FORMAT } from "./share";

const WEEK = /^\d{4}-W\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const DIAL_FORMAT = { sleep: "int", recovery: "int", strain: "decimal1" } as const;
const BALANCE_TONE = { balanced: "text-optimal-text", overreaching: "text-warning-text", undertrained: "text-muted-foreground" };

function periodLabel(kind: "week" | "month", start: string, end: string) {
  return kind === "week" ? rangeLabel(start, end) : formatDay(start, DAY.monthYear);
}

/** The period in view and its neighbours' view model, or why there is none. */
async function load(period: string, ctx: Parameters<typeof getReport>[1], targets: PlanTargets) {
  const vm = await getReport(period, ctx, targets);
  const latest = vm ? null : await latestReport(ctx, WEEK.test(period) ? "week" : "month");
  return { period, vm, latest, today: todayOf(ctx) };
}

/** Previous / next period; the next arrow is disabled at the latest period (spec §7.13). Replaces the route's period in place. */
function PeriodSwitcher({ vm }: { vm: ReportVM }) {
  const step = (to: string | null, dir: "prev" | "next") => {
    const label = `${dir === "prev" ? "Previous" : "Next"} ${vm.kind}`;
    return (
      <Press activeScale={0.96} activeBg="bg-accent" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !to }} disabled={!to} onPress={() => to && (haptic.tap(), router.setParams({ period: to }))} hitSlop={4} className={cn("size-9 items-center justify-center rounded-full", !to && "opacity-40")}>
        <Icon icon={dir === "prev" ? ChevronLeft : ChevronRight} size={18} tone="foreground" strokeWidth={2} />
      </Press>
    );
  };
  return (
    <View className="h-9 flex-row items-center self-center rounded-full bg-secondary">
      {step(vm.prev, "prev")}
      <Text className="min-w-24 whitespace-nowrap px-3 text-center text-[11px] font-bold uppercase leading-4 tracking-[0.1em] tabular-nums">{periodLabel(vm.kind, vm.start, vm.end)}</Text>
      {step(vm.next, "next")}
    </View>
  );
}

/** Week / Month: each goes to the latest period of its kind. */
function KindToggle({ kind, week, month }: { kind: "week" | "month"; week: string | null; month: string | null }) {
  const item = (k: "week" | "month", label: string, to: string | null) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: kind === k, disabled: !to }}
      disabled={!to}
      onPress={() => to && kind !== k && (haptic.select(), router.setParams({ period: to }))}
      className={cn(SEGMENT, "min-w-11 px-3", kind === k && SEGMENT_ON, !to && "opacity-40")}
    >
      <Text className={cn("text-[13px] font-bold uppercase tracking-[0.1em]", kind === k ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityLabel="Report period" className="flex-row gap-0.5 self-center rounded-lg bg-muted p-0.5">
      {item("week", "Week", week)}
      {item("month", "Month", month)}
    </View>
  );
}

function Dials({ vm }: { vm: ReportVM }) {
  const word = vm.kind === "week" ? "last week" : "last month";
  // The web's row is as wide as its columns' contents laid end to end (the hero shrinks to fit), then shares that
  // width equally (flex-1 basis-0), so a long label ("AVG RECOVERY") wraps in its column. A first pass measures the
  // natural width; the second lays the equal columns out in it. Remeasured when the dials change. Never wider than the
  // hero (maxWidth): on a narrow phone the web's w-full row is the container, and the labels and captions wrap.
  const sig = vm.dials.map((d) => `${d.label}${d.metric.value}${d.delta}`).join("|");
  const [fit, setFit] = useState<{ sig: string; width: number } | null>(null);
  const width = fit?.sig === sig ? fit.width : null;
  return (
    <View
      className="flex-row items-start justify-center gap-5"
      style={width ? { width, maxWidth: "100%" } : { alignSelf: "center", maxWidth: "100%" }}
      onLayout={width ? undefined : (e) => setFit({ sig, width: Math.ceil(e.nativeEvent.layout.width) })}
    >
      {vm.dials.map((dl) => {
        const f = DIAL_FORMAT[dl.key];
        const tone = dl.delta === null || dl.key === "strain" || Math.round(dl.delta * 10) === 0 ? "text-muted-foreground" : dl.delta > 0 ? "text-optimal-text" : "text-warning-text";
        return (
          <View key={dl.key} className={cn("items-center gap-1.5", width ? "min-w-0 flex-1 basis-0" : undefined)}>
            <ScoreDial variant={dl.key} size="md" value={dl.metric.value} reason={dl.metric.reason} label={dl.label} />
            {dl.delta !== null && (
              <Text className={cn(CAPTION, "text-center tabular-nums", tone)}>
                {formatValue(f === "int" ? "signedInt" : "signed1", dl.delta)} vs. {word}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Averages({ stats, word }: { stats: KeyStat[]; word: string }) {
  return (
    <Divided>
      {stats.map((s) => {
        const f = STAT_FORMAT[s.key] ?? { format: "decimal1" as const };
        const k = f.scale ?? 1;
        return (
          <KeyStatRow
            key={s.key}
            variant="row"
            label={s.label}
            metric={s.metric.value === null ? s.metric : { ...s.metric, value: s.metric.value * k }}
            unit={f.unit}
            format={f.format}
            average={s.average === null ? null : s.average * k}
            averageLabel={`${word}'s average`}
            direction={s.direction}
          />
        );
      })}
    </Divided>
  );
}

/** The header's share action: the report as text through the system share sheet (halo's Report.tsx ShareButton). */
function ShareButton({ vm }: { vm: ReportPageVM }) {
  const share = () => {
    // The sheet's own cancel resolves; a failure to open it leaves nothing to undo.
    Share.share({ message: reportShareText(vm) }, { dialogTitle: `Share ${vm.kind === "week" ? "weekly" : "monthly"} report` }).catch(() => {});
  };
  return (
    <Button variant="ghost" size="icon-touch" onPress={share} accessibilityLabel={`Share this ${vm.kind}'s report`}>
      <Icon icon={Share2} size={22} tone="foreground" strokeWidth={1.75} />
    </Button>
  );
}

export default function ReportScreen() {
  const { period } = useLocalSearchParams<{ period: string }>();
  const isWeek = WEEK.test(period);
  const valid = isWeek || MONTH.test(period);
  // The assessment scores the period against the Weekly plan's targets (src/state/weeklyPlan.ts), as halo's report does.
  const { plan } = useWeeklyPlan();
  const { data, error, reload } = useScreen((ctx) => load(period, ctx, plan.targets), ["report", period, plan.targets]);
  const title = isWeek ? "Weekly report" : "Monthly report";

  if (!valid) return <DetailShell title="Report" primary={<EmptyState body="Page not found." />} />;
  if (error && !data) return <LoadError title={title} reload={reload} />;
  if (!data) return <Loading />;

  const { vm, latest, today } = data;
  if (!vm)
    return (
      <DetailShell
        title={title}
        hero={<EmptyState body={`No data for this ${isWeek ? "week" : "month"}.`} action={latest ? { label: `Latest ${isWeek ? "week" : "month"}`, href: `/reports/${latest.period}` } : undefined} />}
      />
    );

  const word = vm.kind === "week" ? "last week" : "last month";
  return (
    <DetailShell
      title={title}
      bodySkeleton={BODY_SKELETON}
      action={<ShareButton vm={vm} />}
      hero={
        <View className="w-full items-center gap-5">
          <View className="items-center gap-3">
            <PeriodSwitcher vm={vm} />
            <KindToggle kind={vm.kind} week={vm.latestWeek} month={vm.latestMonth} />
            {vm.partial && <MetricTags extra={[vm.kind === "week" ? "partial_week" : "partial_month"]} />}
          </View>
          <Dials vm={vm} />
        </View>
      }
      insight={vm.insight && <InsightCard body={vm.insight} />}
      primary={
        <SectionShell variant="card" title="Recovery breakdown" aside={<Text className={CAPTION}>Days</Text>}>
          <ZoneBars
            variant="stacked"
            unit="days"
            emptyCopy="No days with Recovery in this period."
            data={vm.bands.value ? { ...vm.bands, value: vm.bands.value.map((b) => ({ ...b, color: b.color as DataColor })) } : null}
          />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="avg" variant="card" title="Averages" aside={<Text className={CAPTION}>vs. {word}</Text>}>
          <Averages stats={vm.averages} word={word} />
        </SectionShell>,
        <SectionShell key="balance" variant="card" title="Training balance">
          {vm.trainingBalance.value ? (
            <View className="gap-1">
              <Text className={cn("font-numeric text-xl font-bold leading-6", BALANCE_TONE[vm.trainingBalance.value.status])}>{vm.trainingBalance.value.word}</Text>
              <Text className={cn(CAPTION, "tabular-nums")}>Training load (ACWR) {formatValue("decimal2", vm.trainingBalance.value.acwr)}</Text>
              <Text className="pt-2 text-[15px] leading-[22px] text-foreground-secondary">{vm.trainingBalance.value.line}</Text>
            </View>
          ) : (
            <EmptyState body="Not enough data for a training balance." className="py-4" />
          )}
        </SectionShell>,
        <SectionShell key="journal" variant="card" title="Top journal effects" action={{ label: "View all", href: "/journal/insights" }}>
          {vm.topImpacts.length ? <DriverList variant="impact" unit="%" data={{ value: vm.topImpacts.slice(0, 3), reason: null, provisional: false }} /> : <EmptyState body="No journal effects yet." className="py-4" />}
        </SectionShell>,
        ...(vm.bestWorst
          ? [
              <SectionShell key="best" variant="card" title="Best and worst day">
                <Divided>
                  {vm.bestWorst.map((b) => (
                    <Press
                      activeBg="bg-accent"
                      key={b.label}
                      accessibilityRole="link"
                      accessibilityLabel={`${b.label}: ${formatDay(b.day, DAY.long)}, Recovery ${Math.round(b.recovery)} percent${b.strain === null ? "" : `, strain ${formatValue("decimal1", b.strain)}`}`}
                      onPress={() => push(dayHref("/", b.day, today))}
                      className="-mx-2 min-h-16 flex-row items-center gap-3 rounded-lg px-2 py-2"
                    >
                      <View accessibilityElementsHidden className="min-w-0 flex-1">
                        <Text className={cn(LABEL, "text-foreground")}>{b.label}</Text>
                        <Text className={cn(CAPTION, "mt-1 tabular-nums")}>{formatDay(b.day, DAY.short)}</Text>
                      </View>
                      <View accessibilityElementsHidden className="flex-row items-center gap-4">
                        <ScoreDial variant="recovery" size="sm" value={b.recovery} />
                        <View className="w-12 items-end">
                          <Text className="font-numeric text-xl font-bold leading-6 tabular-nums text-strain-text">{formatValue("decimal1", b.strain)}</Text>
                          <Text className={CAPTION}>Strain</Text>
                        </View>
                      </View>
                      <Icon icon={ChevronRight} size={16} tone="muted-foreground" strokeWidth={1.75} />
                    </Press>
                  ))}
                </Divided>
              </SectionShell>,
            ]
          : []),
      ]}
    />
  );
}

const DIALS = [
  ["sleep", "Avg sleep"],
  ["recovery", "Avg recovery"],
  ["strain", "Avg strain"],
] as const;
const AVERAGES = ["Recovery", "Day strain", "Sleep performance", "Hours of sleep", "Sleep consistency", "Heart rate variability", "Resting heart rate"];

const LOADING_PRIMARY = (
  <SectionShell variant="card" title="Recovery breakdown" aside={<Text className={CAPTION}>Days</Text>}>
    <ZoneBarsSkeleton variant="stacked" />
  </SectionShell>
);

const LOADING_SECONDARY = [
  <SectionShell key="avg" variant="card" title="Averages" aside={<SkeletonText className="w-20" />}>
    <View accessibilityElementsHidden>
      <Divided>
        {AVERAGES.map((l) => (
          <KeyStatRowSkeleton key={l} variant="row" label={l} />
        ))}
      </Divided>
    </View>
  </SectionShell>,
  <SectionShell key="balance" variant="card" title="Training balance">
    <View accessibilityElementsHidden className="gap-1">
      <SkeletonText className="w-24" fs={20} lh={24} />
      <SkeletonText className="w-36" />
      <View className="pt-2">
        <SkeletonText className="w-56" fs={15} lh={22} />
        <SkeletonText className="w-24" fs={15} lh={22} />
      </View>
    </View>
  </SectionShell>,
  <SectionShell key="journal" variant="card" title="Top journal effects" action={{ label: "View all", href: "/journal/insights" }}>
    <DriverListSkeleton />
  </SectionShell>,
  <SectionShell key="best" variant="card" title="Best and worst day">
    <View accessibilityElementsHidden>
      <Divided>
        {["Best day", "Worst day"].map((l) => (
          <View key={l} className="min-h-16 flex-row items-center gap-3 py-2">
            <View className="min-w-0 flex-1">
              <Text className={cn(LABEL, "text-foreground")}>{l}</Text>
              <SkeletonText className="mt-1 w-20" />
            </View>
            <ScoreDialSkeleton variant="recovery" size="sm" />
            <View className="w-12 items-end">
              <SkeletonText className="w-9" fs={20} lh={24} />
              <Text className={CAPTION}>Strain</Text>
            </View>
            <Icon icon={ChevronRight} size={16} tone="muted-foreground" strokeWidth={1.75} />
          </View>
        ))}
      </Divided>
    </View>
  </SectionShell>,
];

/** Below the fold while a cold push slides in: the loading state's first sections. */
const BODY_SKELETON = (
  <>
    {LOADING_PRIMARY}
    <View className="gap-3">{LOADING_SECONDARY.slice(0, 2)}</View>
  </>
);

/**
 * Report loading (spec §7.13, §5.19): the period switcher, kind toggle and three dials, the insight, Recovery
 * breakdown, then Averages, Training balance, Top journal effects and Best and worst day. Loading UI gets no params, so
 * the title cannot say week or month.
 */
function Loading() {
  return (
    <DetailShell
      loading
      title="Report"
      hero={
        <View accessibilityElementsHidden className="w-full items-center gap-5">
          <View className="items-center gap-3">
            <Skeleton className="h-9 w-[168px] rounded-full bg-secondary" />
            <View className="flex-row gap-0.5 rounded-lg bg-muted p-0.5">
              {["Week", "Month"].map((l) => (
                <View key={l} className="h-10 min-w-11 justify-center px-3">
                  <Text className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{l}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="w-full flex-row items-start justify-center gap-5">
            {DIALS.map(([k, l]) => (
              <View key={k} className="min-w-0 flex-1 basis-0 items-center gap-1.5">
                <ScoreDialSkeleton variant={k} size="md" label={l} />
                <SkeletonText className="w-20" />
              </View>
            ))}
          </View>
        </View>
      }
      insight={<InsightCardSkeleton />}
      primary={LOADING_PRIMARY}
      bodySkeleton={BODY_SKELETON}
      secondary={LOADING_SECONDARY}
    />
  );
}
