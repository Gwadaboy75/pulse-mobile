import { Moon } from "lucide-react-native";
import { clock, durationWords, hmm } from "@/lib/format";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { TimelineRow, TimelineSkeleton } from "./ActivityCard";

export type SleepCardProps = {
  kind: "sleep" | "nap";
  /** Time asleep, minutes. */
  minutes: number;
  /** Epoch ms. */
  start: number;
  end: number;
  /** `/sleep?d=` for the main sleep (dayHref), `/sleep/nap/[id]` for a nap (napHref). */
  href: string;
  timeZone?: string;
};

/** Sleep or nap row on the day's timeline (spec §5.12). */
export function SleepCard({ kind, minutes, start, end, href, timeZone }: SleepCardProps) {
  const name = kind === "nap" ? "Nap" : "Sleep";
  const s = clock(start, timeZone);
  const e = clock(end, timeZone);
  return (
    <TimelineRow
      href={href}
      // The reference app's light sleep chip; 85 % over the row keeps white text at 3.3 : 1 (large, bold).
      chipClass="bg-sleep/85"
      barClass="bg-foreground/80"
      chip={
        <>
          <Icon icon={Moon} size={16} tone="foreground" strokeWidth={1.75} />
          <Text className="font-numeric text-xl font-bold leading-6 tabular-nums">{hmm(minutes)}</Text>
        </>
      }
      name={name}
      start={s}
      end={e}
      label={`${name}, ${durationWords(minutes)}, ${s} to ${e}`}
    />
  );
}
SleepCard.Skeleton = TimelineSkeleton;
