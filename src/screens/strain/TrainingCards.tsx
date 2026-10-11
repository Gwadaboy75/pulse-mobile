// Version 19's training cards, from halo src/screens/detail/TrainingCards.tsx (its fields and copy) drawn with Pulse's
// kit: Training Readiness with Recovery Time and Training Status (Strain), and a workout's Aerobic Training Effect
// (Activity). Plain views only: a value, a chip, thin meters; nothing animates.
import type { ReactNode } from "react";
import { View } from "react-native";
import type { ChipTone } from "@/lib/bands";
import { clock, formatValue, MISSING } from "@/lib/format";
import type { Metric } from "@/lib/reasons";
import { getTraining, type TrainingEffectVM, type TrainingVM } from "@/queries/training";
import { cn } from "@/ui/cn";
import { CAPTION, LABEL, StatusChip, ValueUnit } from "@/ui/metrics/primitives";
import { ReasonPlaceholder } from "@/ui/metrics/ReasonPlaceholder";
import { MetricState } from "@/ui/shells/MetricState";
import { SectionShell } from "@/ui/shells/SectionShell";
import type { InfoContent } from "@/ui/shells/InfoButton";
import { Skeleton } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useScreen } from "../useScreen";

function P({ children }: { children: ReactNode }) {
  return <Text className="text-[15px] leading-[22px] text-foreground-body">{children}</Text>;
}
export const SOURCE_NOTE = <Text className="text-[13px] leading-[18px] text-muted-foreground">Pulse scores, computed from your Fitbit data.</Text>;

/** A tone's ink for a number: the chip's text colour. */
export const TONE_TEXT: Record<ChipTone, string> = { optimal: "text-optimal-text", warning: "text-warning-text", alert: "text-recovery-red-text", neutral: "text-foreground" };
const TONE_BG: Record<ChipTone, string> = { optimal: "bg-optimal", warning: "bg-warning", alert: "bg-recovery-red", neutral: "bg-foreground-secondary" };
export const BIG = "font-numeric text-4xl font-bold leading-10 tracking-[-0.01em]";

/** A thin meter: `frac` of the track in the tone's colour. */
export function Meter({ frac, tone }: { frac: number | null; tone: ChipTone }) {
  return (
    <View accessibilityElementsHidden className="h-1.5 w-full overflow-hidden rounded-full bg-dial-track">
      {frac !== null && <View className={cn("h-full rounded-full", TONE_BG[tone])} style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%` }} />}
    </View>
  );
}

/** A label over its value, half the card's width. */
export function Stat({ label, value, unit, spoken, className }: { label: string; value: string; unit?: string; spoken: string; className?: string }) {
  return (
    <View accessible accessibilityLabel={spoken} className="w-1/2 gap-1 pb-3">
      <ValueUnit value={value} unit={unit} className={cn("font-numeric text-xl font-bold leading-6", value === MISSING && "text-muted-foreground", className)} />
      <Text className={cn(LABEL, "text-muted-foreground")}>{label}</Text>
    </View>
  );
}

export const TRAINING_READINESS_INFO: InfoContent = {
  title: "Training Readiness",
  body: (
    <>
      <P>
        How ready you are for hard training today, from 1 to 100, in the manner of Garmin’s Training Readiness. Last night’s sleep and your recovery time weigh
        most (a quarter each), then your HRV status and load ratio, then your sleep over the last 3 nights and your stress over the last 3 days. One very weak
        factor caps the score, and a very long day awake before last night takes 10 off.
      </P>
      <P>95-100 Prime, 75-94 High, 50-74 Moderate, 25-49 Low, 1-24 Poor. It is set at wake and drops after training as recovery time builds.</P>
      <P>
        Recovery time is how long until you are ready for another hard session: each workout adds hours from its Training Effect (about a day at 3.5, three at
        5), up to 96. It counts down faster during good sleep and slower in stressful hours or after a poor night.
      </P>
      <P>Garmin doesn’t publish its weights; these are Pulse’s.</P>
      {SOURCE_NOTE}
    </>
  ),
};

export const TRAINING_STATUS_INFO: InfoContent = {
  title: "Training Status",
  body: (
    <>
      <P>
        What your recent training is doing, in the manner of Garmin’s Training Status: from your load ratio (Garmin’s acute against chronic load), the trend of
        Fitbit’s VO2 max over 28 days, and your HRV Status.
      </P>
      <P>
        Productive: load at your usual or above, with VO2 max rising or HRV steady. Maintaining: enough to hold fitness. Recovery: a lighter stretch. Peaking:
        fitness up while load eases. Unproductive: steady load but VO2 max falling. Overreaching: very high load that is starting to cost you. Strained: HRV low
        under load. Detraining: far below your usual load for a week.
      </P>
      <P>Fitbit’s VO2 max moves slowly, so the trend is read over 28 days, not Garmin’s 14. Needs about 3 weeks of data, and a VO2 max or an HRV Status.</P>
      {SOURCE_NOTE}
    </>
  ),
};

export const TRAINING_EFFECT_INFO: InfoContent = {
  title: "Training Effect",
  body: (
    <>
      <P>
        How much this workout improves your aerobic fitness, from 0 to 5, in the manner of Garmin’s Aerobic Training Effect. Pulse estimates the session’s EPOC
        (the extra oxygen your body uses afterwards to recover) from your heart rate and VO2 max, and compares it with what your fitness and recent training make
        routine: the same run counts for less the fitter and busier you are.
      </P>
      <P>0-0.9 No benefit, 1-1.9 Minor, 2-2.9 Maintaining, 3-3.9 Improving, 4-4.9 Highly improving, 5 Overreaching.</P>
      <P>
        Garmin estimates EPOC with beat-to-beat data and constants it doesn’t publish; Pulse’s comes from heart rate alone, fitted to Firstbeat’s published
        figures. There is no anaerobic Training Effect: it needs pace or power.
      </P>
      {SOURCE_NOTE}
    </>
  ),
};

/** "13 h" / "1 h 30 min" for recovery hours. */
export const hoursText = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min === 60 ? `${whole + 1} h` : min ? `${whole} h ${min} min` : `${whole} h`;
};

const factorTone = (v: number): ChipTone => (v >= 75 ? "optimal" : v >= 50 ? "neutral" : v >= 25 ? "warning" : "alert");
const cardSkeleton = <Skeleton className="h-40 w-full rounded-lg" />;

function ReadinessBody({ vm, timeZone }: { vm: TrainingVM; timeZone: string }) {
  const rt = vm.recoveryTime.value;
  return (
    <MetricState
      metric={vm.readiness}
      skeleton={cardSkeleton}
      renderReason={(r, meta) => <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" copy={r === "calibrating" ? "Training Readiness needs a scored night and about 3 weeks of training data." : undefined} />}
    >
      {(r) => (
        <View className="gap-4">
          <View className="gap-2">
            <View accessible accessibilityLabel={`Training Readiness ${r.score} of 100, ${r.band}`} className="flex-row flex-wrap items-center gap-3">
              <ValueUnit value={String(r.score)} unit="of 100" className={cn(BIG, TONE_TEXT[r.tone])} />
              <StatusChip tone={r.tone} className="self-center">{r.band}</StatusChip>
              {vm.isToday && r.atWake !== null && r.atWake !== r.score && <Text className={cn(CAPTION, "tabular-nums")}>At wake {r.atWake}</Text>}
            </View>
            <Text className="text-[15px] leading-[22px] text-foreground-secondary">{r.line}</Text>
          </View>
          {rt && (
            <View accessible accessibilityLabel={rt.hours > 0 ? `Recovery time ${hoursText(rt.hours)}` : "Recovery time: fully recovered"} className="gap-0.5">
              <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
                <Text className={LABEL}>Recovery time</Text>
                <Text className={cn("font-numeric text-xl font-bold leading-6 tabular-nums", rt.hours > 0 ? "text-warning-text" : "text-optimal-text")}>{rt.hours > 0 ? hoursText(rt.hours) : "Recovered"}</Text>
              </View>
              {rt.readyAt !== null && vm.isToday && (
                <Text className={CAPTION}>{`Ready for hard training around ${clock(rt.readyAt, timeZone)}${rt.hours >= 24 ? ` in ${Math.round(rt.hours / 24)} day${Math.round(rt.hours / 24) === 1 ? "" : "s"}` : ""}`}</Text>
              )}
            </View>
          )}
          <View className="gap-3">
            {r.factors.map((f) => (
              <View key={f.key} accessible accessibilityLabel={`${f.label}: ${f.value === null ? "not available" : `${f.value} of 100`}`} className="gap-1.5">
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="min-w-0 shrink text-[15px] leading-5 text-foreground-body">{f.label}</Text>
                  <Text className={cn("font-numeric text-base font-bold leading-5 tabular-nums", f.value === null && "text-muted-foreground")}>{f.value === null ? MISSING : f.value}</Text>
                </View>
                <Meter frac={f.value === null ? null : f.value / 100} tone={f.value === null ? "neutral" : factorTone(f.value)} />
              </View>
            ))}
          </View>
        </View>
      )}
    </MetricState>
  );
}

function StatusBody({ status }: { status: TrainingVM["status"] }) {
  return (
    <MetricState
      metric={status}
      skeleton={cardSkeleton}
      renderReason={(r, meta) => (
        <ReasonPlaceholder
          reason={r}
          nightsLeft={meta.nightsLeft}
          size="md"
          copy={r === "calibrating" ? "Training Status needs about 3 weeks of training data." : r === "no_data" ? "Training Status needs a VO2 max from Fitbit or an HRV Status." : undefined}
        />
      )}
    >
      {(s) => (
        <View className="gap-4">
          <View className="gap-2">
            <StatusChip tone={s.tone}>{s.status}</StatusChip>
            <Text className="text-[15px] leading-[22px] text-foreground-secondary">{s.line}</Text>
          </View>
          <View className="flex-row flex-wrap">
            <Stat label="Load ratio" value={formatValue("decimal2", s.loadRatio)} spoken={`Load ratio ${s.loadRatio ?? "not available"}`} />
            <Stat
              label="VO2 max trend"
              value={s.vo2PerMonth === null ? MISSING : `${s.vo2PerMonth > 0 ? "+" : ""}${formatValue("decimal1", s.vo2PerMonth)}`}
              unit="a month"
              spoken={s.vo2PerMonth === null ? "VO2 max trend not available" : `VO2 max trend ${s.vo2PerMonth} a month`}
            />
            <Stat label="HRV status" value={s.hrv ?? "Not yet"} spoken={`HRV status ${s.hrv ?? "not yet"}`} className={cn("font-sans text-base", !s.hrv && "text-muted-foreground")} />
          </View>
        </View>
      )}
    </MetricState>
  );
}

/** Strain's two training cards for day `d`, loaded on their own so the page's query is unchanged. */
export function TrainingSection({ d, timeZone }: { d: string; timeZone: string }) {
  const vm = useScreen((ctx) => getTraining(d, ctx), ["training", d]).data;
  return (
    <View className="gap-4">
      <SectionShell variant="card" title="Training Readiness" info={TRAINING_READINESS_INFO}>
        {vm ? <ReadinessBody vm={vm} timeZone={timeZone} /> : cardSkeleton}
      </SectionShell>
      <SectionShell variant="card" title="Training Status" info={TRAINING_STATUS_INFO}>
        {vm ? <StatusBody status={vm.status} /> : cardSkeleton}
      </SectionShell>
    </View>
  );
}

/** A workout's Aerobic Training Effect, its main benefit and the recovery time it added (Activity). */
export function TrainingEffectCard({ te }: { te: TrainingEffectVM | null }) {
  const metric: Metric<TrainingEffectVM> = te ? { value: te, reason: null, provisional: false } : { value: null, reason: "insufficient_hr_data", provisional: false };
  return (
    <SectionShell variant="card" title="Training effect" info={TRAINING_EFFECT_INFO}>
      <MetricState metric={metric} skeleton={null}>
        {(t) => (
          <View className="gap-4">
            <View accessible accessibilityLabel={`Aerobic Training Effect ${formatValue("decimal1", t.te)} of 5, ${t.label}`} className="gap-2">
              <View className="flex-row flex-wrap items-center gap-3">
                <ValueUnit value={formatValue("decimal1", t.te)} unit="of 5" className={cn(BIG, TONE_TEXT[t.tone])} />
                <StatusChip tone={t.tone} className="self-center">{t.label}</StatusChip>
              </View>
              <Meter frac={t.te / 5} tone={t.tone} />
            </View>
            <View className="gap-1">
              <View className="flex-row flex-wrap items-baseline gap-x-2">
                <Text className={cn(LABEL, "text-muted-foreground")}>Main benefit</Text>
                <Text className="text-base font-semibold leading-[22px]">{t.benefit}</Text>
              </View>
              <Text className={CAPTION}>{t.benefitLine}</Text>
            </View>
            {t.recoveryHours > 0 && (
              <View accessible accessibilityLabel={`Adds ${hoursText(t.recoveryHours)} of recovery time`} className="flex-row flex-wrap items-baseline justify-between gap-x-3">
                <Text className={LABEL}>Adds recovery time</Text>
                <Text className="font-numeric text-xl font-bold leading-6 tabular-nums text-warning-text">{hoursText(t.recoveryHours)}</Text>
              </View>
            )}
          </View>
        )}
      </MetricState>
    </SectionShell>
  );
}
