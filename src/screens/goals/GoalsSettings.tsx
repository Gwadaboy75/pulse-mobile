// Settings › Goals `/settings?s=goals` (halo src/screens/settings/goals.tsx and weeklyPlan.tsx), on our kit: each daily
// goal with a switch and a numeric target in its unit, the weekly Active Zone Minutes target, then the Weekly plan's
// targets with the evidence behind each default. Saved as typed (src/state/goals.ts, src/state/weeklyPlan.ts), so the
// cards and trend lines follow at once; an out-of-range number is shown in red and not saved.
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Moon, Target, type LucideIcon } from "lucide-react-native";
import { isDefaultPlan, parsePlanTarget, PLAN_DEFAULTS, PLAN_LIMITS, withPlanEnabled, withPlanTarget } from "@/core/algorithms/weeklyPlan";
import { GOAL_KEYS, GOAL_META, type GoalKey } from "@/queries/goals";
import { PLAN_KEYS, PLAN_META, type PlanKey } from "@/queries/weeklyPlan";
import { STAT_ICON } from "@/screens/_lib/view";
import { BODY, HINT, ROW, ROW_LABEL, ROW_RULE, Switch, TextField } from "@/screens/settings/controls";
import { useGoals, isDefaultGoals, parseTarget, TARGET_LIMITS, withEnabled, withTarget, type TargetKey } from "@/state/goals";
import { useWeeklyPlan } from "@/state/weeklyPlan";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { toast } from "@/ui/Toast";
import { PLAN_ICON } from "./WeeklyPlan";

const GOAL_HINT: Partial<Record<TargetKey, string>> = {
  sleep: "Blank follows Pulse’s sleep need for the night.",
  azmWeek: "Fitbit counts moderate minutes once and vigorous or peak minutes twice.",
};

const PLAN_HINT: Record<PlanKey, string> = {
  zone13: "WHO: 150–300 minutes a week. Counted from 40% of heart-rate reserve, a brisk walk, as Pulse Age counts it.",
  zone45: "WHO: 75–150 minutes a week, or mix them with moderate minutes.",
  strength: "Strength, weights, HIIT or calisthenics workouts. WHO: 2 or more days a week.",
  steps: "The benefit levels off around 8,000 to 10,000 steps a day (Paluch 2022).",
  consistency: "Your sleep consistency over the last 7 nights. 80% and up is optimal.",
  sleepNeed: "Nights you sleep the need Pulse sets for that night.",
};

/** One goal or habit as one settings row: icon and name (its hint or error under it), then the target with its unit as a caption, then the switch. Off, the target dims. */
function TargetField({ icon, label, on, onToggle, unit, error, hint, field, rule }: { icon: LucideIcon; label: string; on: boolean; onToggle: (on: boolean) => void; unit: string; error?: string; hint?: string; field: ReactNode; rule: boolean }) {
  return (
    <View className={cn(ROW, rule && ROW_RULE)}>
      <Icon icon={icon} size={20} tone={on ? "foreground" : "muted-foreground"} />
      <View className="min-w-0 flex-1">
        <Text className={cn(ROW_LABEL, !on && "text-muted-foreground")}>{label}</Text>
        {error ? (
          <Text accessibilityRole="alert" className="text-[13px] font-medium leading-[18px] text-recovery-red-text">{error}</Text>
        ) : hint ? (
          <Text className={HINT}>{hint}</Text>
        ) : null}
      </View>
      <View className={cn("items-end gap-0.5", !on && "opacity-40")}>
        <View className="w-24">{field}</View>
        <Text className="text-right text-[11px] leading-[14px] text-muted-foreground">{unit}</Text>
      </View>
      <Switch value={on} onValueChange={onToggle} label={`${label} target`} />
    </View>
  );
}

/** Drafts and errors for typed targets: a field shows what is typed until it loses focus, then the stored value. */
function useDrafts<K extends string>() {
  const [drafts, setDrafts] = useState<Partial<Record<K, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const type = (k: K, t: string, error: string | null) => {
    setDrafts((d) => ({ ...d, [k]: t }));
    setErrors((e) => ({ ...e, [k]: error ?? undefined }));
  };
  const blur = (k: K) => {
    if (errors[k]) return; // keep the rejected text in view with its error
    setDrafts(({ [k]: _, ...rest }) => rest as Partial<Record<K, string>>);
  };
  const clear = () => (setDrafts({}), setErrors({}));
  return { drafts, errors, type, blur, clear };
}

function NumberField({ value, onChange, onBlur, placeholder, invalid, label, decimals }: { value: string; onChange: (t: string) => void; onBlur: () => void; placeholder: string; invalid: boolean; label: string; decimals: number }) {
  return <TextField variant="number" value={value} onChangeText={onChange} onBlur={onBlur} placeholder={placeholder} keyboardType={decimals ? "decimal-pad" : "number-pad"} accessibilityLabel={label} invalid={invalid} />;
}

function DailyGoals() {
  const { goals, update, reset } = useGoals();
  const d = useDrafts<TargetKey>();
  const text = (k: TargetKey) => d.drafts[k] ?? (goals.targets[k] === null ? "" : String(goals.targets[k]));
  const field = (k: GoalKey, targetKey: TargetKey, rule: boolean) => {
    const l = TARGET_LIMITS[targetKey];
    const label = targetKey === "azmWeek" ? "Active Zone Minutes a week" : GOAL_META[k].label;
    return (
      <TargetField
        key={targetKey}
        rule={rule}
        icon={(k === "sleep" ? Moon : STAT_ICON[k]) ?? Target}
        label={label}
        on={goals.enabled[k]}
        onToggle={(on) => void update((g) => withEnabled(g, k, on))}
        unit={l.unit}
        error={d.errors[targetKey]}
        hint={GOAL_HINT[targetKey]}
        field={
          <NumberField
            value={text(targetKey)}
            onChange={(t) => {
              const r = parseTarget(targetKey, t);
              d.type(targetKey, t, r.error);
              if (!r.error) void update((g) => withTarget(g, targetKey, r.value));
            }}
            onBlur={() => d.blur(targetKey)}
            placeholder={l.optional ? "Auto" : String(l.min)}
            invalid={!!d.errors[targetKey]}
            label={`${label} target`}
            decimals={l.decimals}
          />
        }
      />
    );
  };
  const doReset = async () => {
    await reset();
    d.clear();
    toast.success("Goals reset to Fitbit’s defaults");
  };
  return (
    <>
      <SectionShell variant="card" title="Daily goals">
        <Text className={cn(BODY, "pb-2")}>Each goal is a tile on Strain that fills through the day. Fitbit’s defaults: 10,000 steps, 8 km, 10 floors, 22 Active Zone Minutes, 30 active minutes and 2,000 ml of water.</Text>
        <View>{GOAL_KEYS.map((k, i) => field(k, k, i > 0))}</View>
      </SectionShell>
      <SectionShell variant="card" title="Weekly goal">
        <Text className={cn(BODY, "pb-2")}>Active Zone Minutes add up over the week, Monday to Sunday. The switch is the daily goal’s.</Text>
        {field("azm", "azmWeek", false)}
      </SectionShell>
      <Button variant="outline-pill" disabled={isDefaultGoals(goals)} onPress={() => void doReset()}>Reset to Fitbit defaults</Button>
    </>
  );
}

function WeeklyTargets() {
  const { plan, update, reset } = useWeeklyPlan();
  const d = useDrafts<PlanKey>();
  const doReset = async () => {
    await reset();
    d.clear();
    toast.success("Weekly plan reset to its defaults");
  };
  return (
    <>
      <SectionShell variant="card" title="Weekly plan">
        <Text className={cn(BODY, "pb-2")}>Weekly targets for the habits Pulse Age scores, tracked on Strain as the Weekly plan, Monday to Sunday, with a streak for every week you meet them.</Text>
        <View>
          {PLAN_KEYS.map((k, i) => (
            <TargetField
              key={k}
              rule={i > 0}
              icon={PLAN_ICON[k]}
              label={PLAN_META[k].label}
              on={plan.enabled[k]}
              onToggle={(on) => void update((p) => withPlanEnabled(p, k, on))}
              unit={PLAN_LIMITS[k].unit}
              error={d.errors[k]}
              hint={PLAN_HINT[k]}
              field={
                <NumberField
                  value={d.drafts[k] ?? String(plan.targets[k])}
                  onChange={(t) => {
                    const r = parsePlanTarget(k, t);
                    d.type(k, t, r.error);
                    if (r.value !== null) void update((p) => withPlanTarget(p, k, r.value!));
                  }}
                  onBlur={() => d.blur(k)}
                  placeholder={String(PLAN_DEFAULTS.targets[k])}
                  invalid={!!d.errors[k]}
                  label={`${PLAN_META[k].label} target`}
                  decimals={0}
                />
              }
            />
          ))}
        </View>
      </SectionShell>
      <Button variant="outline-pill" disabled={isDefaultPlan(plan)} onPress={() => void doReset()}>Reset weekly plan</Button>
    </>
  );
}

export function GoalsSettings() {
  return (
    <>
      <DailyGoals />
      <WeeklyTargets />
    </>
  );
}
