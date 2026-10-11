// Home's heart-rate card, halo's BandTile behaviour (src/screens/home/calm.tsx) drawn with Pulse's kit. With the band
// live over Bluetooth: its bpm, beating, and the last 2 minutes. Otherwise the newest reading the live ticker
// (src/state/liveHr.tsx) holds, how long ago it was taken, and a sparkline of the 30 minutes ending there. The whole
// card opens the Heart rate screen. Only this card re-renders on a tick or a beat.
import { useMemo } from "react";
import { View } from "react-native";
import { minuteMeanHr } from "@/core/algorithms/stress";
import { RECENT_MINUTES } from "@/health/live";
import { MISSING } from "@/lib/format";
import { useApp } from "@/state/app";
import { useLiveHr } from "@/state/liveHr";
import { showsLive, useLiveBle } from "@/state/liveBle";
import { BeatingHeart, LivePill, LiveTrace } from "@/ui/metrics/LiveHeartRate";
import { CAPTION, ValueUnit } from "@/ui/metrics/primitives";
import { Sparkline } from "@/ui/metrics/Sparkline";
import { SectionShell } from "@/ui/shells/SectionShell";
import { SkeletonText } from "@/ui/Skeleton";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { LastReading } from "../health/LastReading";

const HREF = "/health/heart-rate";
const BPM = "font-numeric text-4xl font-bold leading-10 tracking-[-0.01em]";

/** Minute means of the 30 minutes ending at the newest sample's minute; a minute without a sample is a gap. */
function recentMinutes(samples: { ts: number; bpm: number }[], latestTs: number): (number | null)[] {
  const end = Math.floor(latestTs / 60) * 60 + 60;
  return minuteMeanHr(samples, end - RECENT_MINUTES * 60, end).map((v) => (v === null ? null : Math.round(v)));
}

/** `phoneOnly`: Home's no-band day; with no reading at all the card stays out of the way, as the monitor cards do. */
export function HeartRateTile({ phoneOnly }: { phoneOnly?: boolean }) {
  const { c } = useTheme();
  const { liveHr } = useLiveHr();
  const live = useLiveBle();
  const demo = useApp((s) => s.source === "demo");
  const streaming = showsLive(live);
  const { latest, recent, updatedAt } = liveHr;
  const values = useMemo(() => (latest ? recentMinutes(recent, latest.ts) : []), [latest, recent]);
  if (!latest && phoneOnly && !streaming) return null;

  let body;
  if (streaming) {
    const lost = live.status !== "live";
    body = (
      <View className="flex-row items-center gap-4">
        <View className="shrink-0 gap-1.5">
          <View accessible accessibilityLabel={`${lost ? "Reconnecting. Last live reading" : "Live heart rate"} ${live.bpm ?? "unknown"} beats per minute`} className="flex-row items-center gap-2">
            <BeatingHeart bpm={live.bpm ?? 60} live={!lost} />
            <ValueUnit value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" className={BPM} />
          </View>
          <LivePill name={live.device?.name ?? null} lost={lost} />
        </View>
        <View className="min-w-0 flex-1">
          <LiveTrace history={live.history} height={56} />
        </View>
      </View>
    );
  } else if (latest) {
    body = (
      <View className="flex-row items-center gap-4">
        <View className="shrink-0 gap-1">
          <View accessible accessibilityLabel={`Heart rate ${latest.bpm} beats per minute`} className="flex-row items-center gap-2">
            <BeatingHeart bpm={latest.bpm} live={false} />
            <ValueUnit value={String(latest.bpm)} unit="bpm" className={BPM} />
          </View>
          <LastReading t={latest.ts * 1000} now={updatedAt ?? latest.ts * 1000} />
        </View>
        <View className="min-w-0 flex-1" style={{ height: 56 }}>
          <Sparkline values={values} color={c["recovery-red"]} caption={`Last ${RECENT_MINUTES} min`} className="flex-1" />
        </View>
      </View>
    );
  } else if (updatedAt === null) {
    // Before the first live read: the value's shape, nothing to say yet.
    body = (
      <View accessibilityElementsHidden className="gap-1.5">
        <SkeletonText lh={40} fs={36} className="w-24" />
        <SkeletonText className="w-28" />
      </View>
    );
  } else {
    body = (
      <View className="gap-0.5">
        <Text className="text-base font-semibold leading-[22px]">No heart rate yet</Text>
        <Text className={CAPTION}>{demo ? "The sample data has no readings yet." : "Nothing synced from Health Connect yet."}</Text>
      </View>
    );
  }
  return (
    <SectionShell variant="card" title="Heart rate" info={false} href={HREF}>
      {body}
    </SectionShell>
  );
}
