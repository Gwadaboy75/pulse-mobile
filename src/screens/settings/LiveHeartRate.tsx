// Settings › Live heart rate (`/settings?s=live`), from halo src/screens/settings/liveHr.tsx (its behaviour and copy;
// drawn with Pulse's kit). Three cards: the band (status, the remembered band, auto-connect, Go live / Stop, Forget),
// the permissions, and Go live: the three steps in Google Health, then the scan, the bands it finds and the
// connection. With `go=1` (Heart rate's Go live) the scan starts on arrival and again on coming back from Google
// Health, as halo's Go-live sheet does.
//
// The band shares heart rate with the standard Bluetooth Heart Rate Service once Google Health › Fitbit Air ›
// Connections › Share heart rate is on (src/health/ble.ts). Live readings are for viewing only: scores keep using what
// Pulse reads from Health Connect.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BatteryMedium, Bluetooth, BluetoothOff, ChevronRight, ExternalLink, Info, Watch, type LucideIcon } from "lucide-react-native";
import { BACKGROUND_GRACE_MS } from "@/health/ble";
import { signalWord } from "@/health/bleHr";
import { MISSING } from "@/lib/format";
import { showsLive, useLiveBle, type FoundDevice, type LiveControl, type LiveData } from "@/state/liveBle";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { BeatingHeart, GoLiveButton, LivePill, StopLiveButton } from "@/ui/metrics/LiveHeartRate";
import { CAPTION, ValueUnit } from "@/ui/metrics/primitives";
import { Press } from "@/ui/Press";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { useTheme } from "@/ui/theme";
import { openApp } from "../../../modules/pulse-bt";
import { BODY, ConfirmDialog, HINT, ROW, ROW_LABEL, ROW_RULE, ROW_VALUE, Switch } from "./controls";

type Live = LiveControl & LiveData;

const GOOGLE_HEALTH = "com.fitbit.FitbitMobile";
/** How long Pulse keeps the band after leaving the foreground, in words. */
const GRACE_WORDS = `${Math.round(BACKGROUND_GRACE_MS / 1000)} seconds`;
const WARN = "text-[13px] font-semibold leading-[18px] text-warning-text";

/** The status in a few words. */
function statusLabel(l: Live): string {
  switch (l.status) {
    case "live":
      return `Live · ${l.bpm ?? MISSING} bpm`;
    case "lost":
      return "Reconnecting…";
    case "connecting":
      return "Connecting…";
    case "scanning":
      return "Searching…";
    case "unauthorized":
      return "Needs permission";
    case "off":
      return l.radio === "unsupported" ? "No Bluetooth" : l.radio === "unavailable" ? "Not available" : "Bluetooth off";
    default:
      return "Not connected";
  }
}

function Row({ label, value, tone, rule }: { label: string; value: string; tone?: string; rule?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} className={cn(ROW, rule && ROW_RULE)}>
      <Text className={ROW_LABEL}>{label}</Text>
      <Text className={cn(ROW_VALUE, tone)}>{value}</Text>
    </View>
  );
}

/** A tinted box with an icon and a line or two: the band's state when there is no list to show. */
function Panel({ icon, title, body }: { icon: ReactNode; title: string; body?: string | null }) {
  return (
    <View accessibilityRole="summary" className="flex-row items-center gap-3 rounded-xl bg-foreground/[0.04] p-4">
      <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-fill-faint">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold leading-[22px]">{title}</Text>
        {!!body && <Text className={HINT}>{body}</Text>}
      </View>
    </View>
  );
}

// ── The band ─────────────────────────────────────────────────────────────────

function BandCard({ live, onFind }: { live: Live; onFind: () => void }) {
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const linked = live.status === "live" || live.status === "connecting" || live.status === "lost";
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const remembered = live.remembered;
  return (
    <SectionShell variant="card" title="Live heart rate">
      <View>
        <Row label="Status" value={statusLabel(live)} tone={live.status === "live" ? "text-recovery-red-text" : undefined} />
        <Row rule label="Band" value={remembered ? (remembered.name ?? "Unnamed band") : "None yet"} />
        {live.status === "live" && (
          <Row rule label="HRV (RMSSD)" value={live.rmssd === null ? (live.rrMs.length ? "Measuring…" : "Not sent by the band") : `${Math.round(live.rmssd)} ms`} />
        )}
        <View className={cn(ROW, ROW_RULE, !remembered && "opacity-disabled")}>
          <View className="min-w-0 flex-1">
            <Text className={ROW_LABEL}>Connect automatically</Text>
            <Text className={HINT}>Off by default to save the band’s battery. On: Pulse connects whenever it opens and the band is sharing.</Text>
          </View>
          <Switch label="Connect automatically" value={live.autoConnect} disabled={!remembered} onValueChange={(v) => void live.setAutoConnect(v)} />
        </View>
      </View>
      {!!live.error && !linked && (
        <Text accessibilityRole="alert" className={cn(WARN, "mt-2")}>
          {live.error}
        </Text>
      )}
      <View className="mt-4 gap-2">
        {linked ? (
          <StopLiveButton onPress={() => void live.disconnect()} />
        ) : (
          <GoLiveButton status={live.status} onPress={() => (remembered ? void live.connect(remembered.id) : onFind())} disabled={noRadio} />
        )}
        {remembered && (
          <Button variant="outline" textClassName="text-recovery-red-text" onPress={() => setConfirmForget(true)}>
            Forget band
          </Button>
        )}
      </View>
      <ConfirmDialog
        open={confirmForget}
        title="Forget this band?"
        description="Pulse disconnects and stops reconnecting to it. Search again to pick a band."
        confirmLabel="Forget band"
        pendingLabel="Forgetting…"
        pending={forgetting}
        onCancel={() => setConfirmForget(false)}
        onConfirm={async () => {
          setForgetting(true);
          await live.forget();
          setForgetting(false);
          setConfirmForget(false);
        }}
      />
    </SectionShell>
  );
}

function PermissionsCard({ live }: { live: Live }) {
  const [btHint, setBtHint] = useState<string | null>(null);
  const noRadio = live.radio === "unsupported" || live.radio === "unavailable";
  const permission = live.permission === "granted" ? "Allowed" : live.permission === "blocked" ? "Blocked in Android settings" : "Not allowed yet";
  const radio = live.radio === "on" ? "On" : live.radio === "off" ? "Off" : live.radio === "turning" ? "Turning on or off" : noRadio ? "Not available" : "Unknown";
  return (
    <SectionShell variant="card" title="Permissions">
      <View>
        <Row label="Nearby devices" value={permission} tone={live.permission === "granted" ? undefined : "text-warning-text"} />
        <Row rule label="Bluetooth" value={radio} tone={live.radio === "on" ? undefined : "text-warning-text"} />
      </View>
      <Text className={cn(HINT, "mt-2")}>Android asks for Nearby devices (scan and connect) only. Pulse never uses your location for this.</Text>
      {live.permission !== "granted" && (
        <Button className="mt-4" onPress={() => void live.requestPermission()}>
          {live.permission === "blocked" ? "Open Android settings" : "Allow Nearby devices"}
        </Button>
      )}
      {live.permission === "granted" && live.radio === "off" && (
        <Button className="mt-4" onPress={() => void live.turnOnBluetooth().then((ok) => setBtHint(ok ? null : "Turn Bluetooth on from Quick Settings."))}>
          Turn on Bluetooth
        </Button>
      )}
      {!!btHint && <Text className={cn(WARN, "mt-2")}>{btHint}</Text>}
    </SectionShell>
  );
}

// ── Go live ──────────────────────────────────────────────────────────────────

const STEPS: { title: string; body: string }[] = [
  { title: "Share heart rate", body: "In Google Health, open your Fitbit Air › Connections and turn on Share heart rate." },
  { title: "Always visible (optional)", body: "Turn it on so the band keeps sharing outside workouts. It uses more of the band’s battery." },
  { title: "Connect", body: "Come back to Pulse: it looks for the band. Tap it in the list to connect." },
];

function Steps() {
  const [missing, setMissing] = useState(false);
  return (
    <View className="gap-4">
      {/* Straight to where the setting lives. */}
      <Button variant="secondary" onPress={() => setMissing(!openApp(GOOGLE_HEALTH))} accessibilityLabel="Open Google Health">
        <Icon icon={ExternalLink} size={16} tone="secondary-foreground" strokeWidth={2.25} />
        <Text className="text-[13px] font-bold uppercase tracking-[0.1em] text-secondary-foreground">Open Google Health</Text>
      </Button>
      {missing && <Text className={WARN}>Couldn’t open Google Health. Open it from your home screen.</Text>}
      {STEPS.map((s, i) => (
        <View key={s.title} accessible accessibilityLabel={`Step ${i + 1}: ${s.title}. ${s.body}`} className="flex-row gap-3">
          <View className="size-8 items-center justify-center rounded-full bg-fill-faint">
            <Text className="font-numeric text-base font-bold">{String(i + 1)}</Text>
          </View>
          <View className="min-w-0 flex-1 pt-1">
            <Text className="text-[15px] font-semibold leading-[22px]">{s.title}</Text>
            <Text className={BODY}>{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Note({ icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <View className="flex-row gap-2.5">
      <View className="mt-0.5">
        <Icon icon={icon} size={16} tone="muted-foreground" strokeWidth={2} />
      </View>
      <Text className={cn(HINT, "flex-1")}>{children}</Text>
    </View>
  );
}

function DeviceRow({ d, onPress, aside, rule }: { d: FoundDevice; onPress: () => void; aside?: string; rule?: boolean }) {
  const signal = signalWord(d.rssi);
  const detail = [d.paired ? "Paired with this phone" : d.likely ? "Likely your band" : null, signal ? `${signal} signal` : null, aside ?? null].filter(Boolean).join(" · ");
  return (
    <Press
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${d.name ?? "unnamed device"}${detail ? `, ${detail}` : ""}`}
      onPress={onPress}
      className={cn("min-h-14 flex-row items-center gap-3 py-2", rule && ROW_RULE)}
    >
      <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-fill-faint">
        <Icon icon={Watch} size={20} tone={d.likely ? "recovery-red-text" : "foreground-secondary"} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold leading-[22px]">{d.name ?? "Unnamed device"}</Text>
        {!!detail && <Text className={HINT}>{detail}</Text>}
      </View>
      <Text className="text-xs font-bold uppercase leading-4 tracking-[0.1em] text-foreground-secondary">Connect</Text>
      <Icon icon={ChevronRight} size={16} tone="foreground-secondary" strokeWidth={2} />
    </Press>
  );
}

function secondsUntil(at: number | null, now: number) {
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** What the link is doing, or the scan's list. */
function BandState({ live }: { live: Live }) {
  const { c } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (live.retryAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.retryAt]);
  const name = live.device?.name ?? live.remembered?.name ?? "the band";

  if (live.status === "off") {
    if (live.radio === "unsupported" || live.radio === "unavailable")
      return (
        <Panel
          icon={<Icon icon={BluetoothOff} size={20} tone="foreground-secondary" strokeWidth={2} />}
          title={live.radio === "unsupported" ? "No Bluetooth here" : "Bluetooth isn’t available"}
          body={live.radio === "unsupported" ? "This phone (or emulator) has no Bluetooth Low Energy, so live heart rate can’t work on it." : "This build of Pulse can’t use Bluetooth."}
        />
      );
    return <Panel icon={<Icon icon={BluetoothOff} size={20} tone="warning-text" strokeWidth={2} />} title="Bluetooth is off" body="Turn it on to find your band." />;
  }
  if (live.status === "unauthorized")
    return (
      <Panel
        icon={<Icon icon={Bluetooth} size={20} tone="warning-text" strokeWidth={2} />}
        title="Allow Nearby devices"
        body={live.permission === "blocked" ? "Nearby devices is off for Pulse. Allow it in Android settings › Apps › Pulse › Permissions." : "Pulse needs it to find and connect to your band. It doesn’t use your location."}
      />
    );
  if (showsLive(live))
    return (
      <View accessibilityRole="summary" className="flex-row items-center gap-4 rounded-xl bg-foreground/[0.04] p-4">
        <View className="size-13 items-center justify-center rounded-xl bg-fill-faint">
          <BeatingHeart bpm={live.bpm ?? 60} live={live.status === "live"} size={26} />
        </View>
        <View className="min-w-0 flex-1 gap-1.5">
          <ValueUnit value={live.bpm === null ? MISSING : String(live.bpm)} unit="bpm" className="font-numeric text-[34px] font-bold leading-[38px]" />
          <LivePill name={live.device?.name ?? null} lost={live.status === "lost"} />
        </View>
      </View>
    );
  if (live.status === "connecting" || live.status === "lost") {
    const wait = secondsUntil(live.retryAt, now);
    return (
      <Panel
        icon={<ActivityIndicator size="small" color={c["recovery-red"]} />}
        title={`${live.status === "lost" ? "Reconnecting to" : "Connecting to"} ${name}…`}
        body={wait !== null && wait > 0 ? `${live.error ? `${live.error} ` : ""}Trying again in ${wait} s.` : live.error}
      />
    );
  }

  // idle / scanning: the list.
  const remembered = live.remembered && !live.found.some((d) => d.id === live.remembered!.id) ? live.remembered : null;
  return (
    <View>
      {live.status === "scanning" && (
        <View className="flex-row items-center gap-2.5 py-2">
          <ActivityIndicator size="small" color={c["recovery-red"]} />
          <Text className={cn(BODY, "flex-1")}>Looking for bands sharing heart rate…</Text>
        </View>
      )}
      {live.found.map((d, i) => (
        <DeviceRow key={d.id} rule={i > 0} d={d} onPress={() => void live.connect(d.id)} aside={live.remembered?.id === d.id ? "Last used" : undefined} />
      ))}
      {remembered && (
        <DeviceRow
          rule={live.found.length > 0}
          d={{ id: remembered.id, name: remembered.name, rssi: null, likely: true }}
          onPress={() => void live.connect(remembered.id)}
          aside={live.status === "scanning" ? "Last used, not seen yet" : "Last used"}
        />
      )}
      {live.status === "idle" && !!live.error && (
        <Text accessibilityRole="alert" className={cn(WARN, "mt-2")}>
          {live.error}
        </Text>
      )}
    </View>
  );
}

/** The one action the band's state calls for (halo's Go-live sheet footer). */
function BandAction({ live }: { live: Live }) {
  const [btHint, setBtHint] = useState<string | null>(null);
  let action: ReactNode = null;
  if (live.status === "off") {
    if (live.radio !== "unsupported" && live.radio !== "unavailable")
      action = <Button onPress={() => void live.turnOnBluetooth().then((ok) => setBtHint(ok ? null : "Turn Bluetooth on from Quick Settings, then come back."))}>Turn on Bluetooth</Button>;
  } else if (live.status === "unauthorized")
    action = <Button onPress={() => void live.requestPermission()}>{live.permission === "blocked" ? "Open settings" : "Allow Nearby devices"}</Button>;
  else if (live.status === "live" || live.status === "connecting" || live.status === "lost")
    action = (
      <Button variant="secondary" onPress={() => void live.disconnect()}>
        {live.status === "live" ? "Disconnect" : "Cancel"}
      </Button>
    );
  else if (live.status === "scanning")
    action = (
      <Button variant="secondary" onPress={live.stopScan}>
        Stop searching
      </Button>
    );
  else action = <Button onPress={() => void live.scan()}>{live.found.length || live.error ? "Search again" : "Search for my band"}</Button>;
  return (
    <>
      {action}
      {!!btHint && live.status === "off" && <Text className={WARN}>{btHint}</Text>}
    </>
  );
}

/**
 * Scans on arrival (or once the controller has loaded) and on coming back from Google Health while nothing is
 * connected, and as soon as the permission is granted or Bluetooth comes on. Leaving stops a scan still running.
 */
function useAutoScan(live: Live, on: boolean) {
  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
  });
  const loaded = live.loaded;
  useEffect(() => {
    if (!on || !loaded) return;
    const kick = () => {
      const s = latest.current;
      if (s.status === "idle") void s.scan();
    };
    kick();
    const sub = AppState.addEventListener("change", (st) => st === "active" && kick());
    return () => {
      sub.remove();
      latest.current.stopScan();
    };
  }, [on, loaded]);
  const status = live.status;
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (on && status === "idle" && (was === "off" || was === "unauthorized")) void latest.current.scan();
  }, [on, status]);
}

function GoLiveCard({ live, scanOnArrival }: { live: Live; scanOnArrival: boolean }) {
  useAutoScan(live, scanOnArrival);
  return (
    <SectionShell variant="card" title="Go live">
      <Text className={cn(BODY, "mb-4")}>Beat by beat from your band, over Bluetooth.</Text>
      <Steps />
      <Text className={cn(CAPTION, "mb-2 mt-6 uppercase tracking-[0.1em]")}>Your band</Text>
      <View className="gap-3">
        <BandState live={live} />
        <BandAction live={live} />
      </View>
      <View className="mt-6 gap-2.5">
        <Note icon={BatteryMedium}>
          {`Sharing uses the band’s battery, and the band takes one connection at a time: while Pulse holds it, gym equipment or another app can’t connect. Pulse lets go ${GRACE_WORDS} after you leave it and reconnects when you come back.`}
        </Note>
        <Note icon={Info}>Live readings are for viewing; scores use what Pulse reads from Health Connect.</Note>
      </View>
    </SectionShell>
  );
}

/** Settings › Live heart rate (`/settings?s=live`; `&go=1` scans on arrival). */
export function LiveHeartRate() {
  const live = useLiveBle();
  const { go } = useLocalSearchParams<{ go?: string }>();
  const [find, setFind] = useState(go === "1");
  return (
    <>
      <BandCard live={live} onFind={() => {
          setFind(true);
          void live.scan();
        }} />
      <GoLiveCard live={live} scanOnArrival={find} />
      <PermissionsCard live={live} />
    </>
  );
}
