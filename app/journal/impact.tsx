import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatValue } from "@/lib/format";
import { getJournalInsights } from "@/queries/journal";
import { FOOTER, MetricToggle, parseMetric, WORD } from "@/screens/journal/insights";
import { useScreen } from "@/screens/useScreen";
import { cn } from "@/ui/cn";
import { DriverList } from "@/ui/metrics/DriverList";
import { TaskPage } from "@/ui/shells/TaskPage";
import { Text } from "@/ui/Text";

/** A behaviour's detail (the web's impact sheet, `?behaviour=`): /journal/impact?m=hrv&behaviour=alcohol. */
export default function ImpactPage() {
  const { m, behaviour } = useLocalSearchParams<{ m?: string; behaviour?: string }>();
  const metric = parseMetric(m);
  const { data: vm } = useScreen((ctx) => getJournalInsights(metric, ctx), ["journalInsights", metric]);
  const item = vm?.items.find((i) => i.key === behaviour);
  if (!vm) return <TaskPage title="Behaviour">{null}</TaskPage>;
  // Opened without a behaviour it knows (a bare pulse://journal/impact): the impact list, a row opening its detail here.
  // Before, the page stayed empty. With too few check-ins the list says so (DriverList's empty state).
  if (!item)
    return (
      <TaskPage title="Behaviour">
        <View className="gap-4 pt-2">
          <MetricToggle metric={metric} />
          <DriverList variant="impact" unit={vm.unit} data={{ value: vm.items, reason: null, provisional: false }} onSelect={(k) => router.setParams({ behaviour: k })} outcome={WORD[metric]} />
        </View>
      </TaskPage>
    );

  const sd = vm.unit === "SD";
  const fx = (v: number, signed = true) => (sd ? `${formatValue(signed ? "signed1" : "decimal1", v)} SD` : `${formatValue(signed ? "signedInt" : "int", v)}%`);
  const avg = (v: number | null) => (v === null ? "--" : sd ? `${formatValue("signed1", v)} SD` : `${formatValue("int", v)}%`);
  const tone = item.effect === "positive" ? "text-optimal-text" : item.effect === "negative" ? "text-warning-text" : "text-foreground-secondary";
  const rows = [
    ["Days with", String(item.yes ?? "--")],
    ["Days without", String(item.no ?? "--")],
    ["90% confidence", item.ci ? `${fx(item.ci[0], false)} to ${fx(item.ci[1], false)}` : "--"],
    ["Average with", avg(item.avgWith)],
    ["Average without", avg(item.avgWithout)],
  ];
  return (
    <TaskPage title={item.label}>
      <View className="gap-4 pt-2">
        <View>
          <Text className={cn("font-numeric text-4xl font-bold leading-10 tracking-[-0.01em] tabular-nums", tone)}>{fx(item.delta)}</Text>
          <Text className="text-[15px] leading-[22px] text-foreground-secondary">next-day {WORD[metric]}</Text>
        </View>
        <View>
          {rows.map(([k, v], i) => (
            <View key={k} className={cn("min-h-11 flex-row items-center justify-between gap-3 border-border", i > 0 && "border-t")}>
              <Text className="text-[15px] leading-[22px] text-foreground-secondary">{k}</Text>
              <Text className="font-numeric text-[15px] font-semibold leading-[22px] tabular-nums">{v}</Text>
            </View>
          ))}
        </View>
        <Text className="text-xs font-medium leading-4 text-muted-foreground">{FOOTER}</Text>
      </View>
    </TaskPage>
  );
}
