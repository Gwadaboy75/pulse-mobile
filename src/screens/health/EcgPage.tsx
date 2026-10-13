// An ECG reading's page (the web shows it in a `?ecg=<id>` ResponsiveSheet, "ECG reading"; pulse monitor/HeartRhythm.tsx).
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DAY, formatDay } from "@/lib/format";
import { getMonitor } from "@/queries/health";
import { StatusChip, ValueUnit, CAPTION } from "@/ui/metrics/primitives";
import { EmptyState } from "@/ui/shells/EmptyState";
import { TaskPage } from "@/ui/shells/TaskPage";
import { Text } from "@/ui/Text";
import { useScreen } from "../useScreen";
import { bpm, RHYTHM_DISCLAIMER } from "./HeartRhythm";

export function EcgPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // halo has no single-reading query: the reading comes from the Health Monitor's heart rhythm (ECGs from an older Google import).
  const { data: shown } = useScreen(async (ctx) => (await getMonitor(ctx.today, ctx)).heartRhythm.ecg.find((e) => e.id === id) ?? null, ["ecgPage", id]);
  return (
    <TaskPage title="ECG reading">
      {/* Opened without a reading it knows (a bare link, or one Health Connect no longer has), it says so: before, the page was empty. */}
      {shown === null && <EmptyState body="No ECG reading to show. Health Connect does not carry ECG readings." />}
      {shown && (
        <View className="gap-4">
          <View className="items-start gap-2">
            <ValueUnit value={bpm(shown)} unit="bpm avg" className="font-numeric text-4xl font-bold leading-10 tracking-[-0.01em]" />
            <StatusChip tone={shown.tone}>{shown.label}</StatusChip>
          </View>
          <Text className="text-[15px] leading-[22px] tabular-nums text-foreground-secondary">
            {formatDay(shown.day, DAY.long)} at {shown.time}
          </Text>
          <Text className="text-[15px] leading-[22px]">{shown.explanation}</Text>
          <Text className={CAPTION}>{RHYTHM_DISCLAIMER}</Text>
        </View>
      )}
    </TaskPage>
  );
}
