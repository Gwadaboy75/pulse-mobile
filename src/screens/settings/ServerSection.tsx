// Réglages › Mon serveur (`/settings?s=server`, docs/server.md): the fork's link to the person's own Pulse server.
// Pair with the code Pulse shows under Settings › Data source › Pair phone (pasted: the link, or the URL and the secret),
// send after every sync, send now, send the whole history, unpair. In French, as the fork's new screens are.
import { useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { CloudUpload } from "lucide-react-native";
import { ago } from "@/lib/format";
import { clearPairing, parsePairing, readPairing, readState, savePairing, serverHost, subscribe, writeState, type Pairing, type PushState } from "@/push/pairing";
import { HISTORY_DAYS, ping, PushError, pushToServer, type PushErrorCode } from "@/push/push";
import { appState, useApp } from "@/state/app";
import { Button } from "@/ui/Button";
import { cn } from "@/ui/cn";
import { Icon } from "@/ui/Icon";
import { SectionShell } from "@/ui/shells/SectionShell";
import { Text } from "@/ui/Text";
import { toast } from "@/ui/Toast";
import { BODY, ConfirmDialog, Field, HINT, ROW, ROW_LABEL, ROW_RULE, ROW_VALUE, Switch, TextField } from "./controls";

const C = {
  title: "Mon serveur",
  intro: "Envoie ce que Pulse lit dans Health Connect à votre propre serveur Pulse, après chaque synchronisation. Le site reçoit les mêmes données que ce téléphone ; chacun calcule ses scores avec son moteur.",
  paste: "Code d’appairage",
  pasteHint: "Sur le site : Réglages › Source de données › Appairer le téléphone, puis copiez le lien du code, ou l’adresse et le secret.",
  placeholder: "https://… ou le lien du code",
  pair: "Appairer",
  pairing: "Vérification…",
  paired: (name: string, host: string) => `${name} · ${host}`,
  since: (when: string) => `Appairé ${when}`,
  lastSent: (when: string, days: number) => `Dernier envoi ${when} · ${days} jour${days > 1 ? "s" : ""}`,
  never: "Rien envoyé pour l’instant",
  auto: "Envoyer après chaque synchronisation",
  autoHint: "Aussi depuis la synchronisation en arrière-plan, quand elle est activée.",
  sendNow: "Envoyer maintenant",
  sending: "Envoi…",
  sendHistory: `Envoyer l’historique (${HISTORY_DAYS} j)`,
  unpair: "Dissocier",
  unpairTitle: "Dissocier ce serveur ?",
  unpairBody: "Le téléphone cesse d’envoyer. Rien de ce qui a déjà été envoyé n’est supprimé sur le serveur.",
  unpairing: "Dissociation…",
  sent: (n: number, days: number) => (n === 0 ? "Rien de nouveau à envoyer." : `Envoyé : ${days} jour${days > 1 ? "s" : ""} en ${n} envoi${n > 1 ? "s" : ""}.`),
  pairedToast: "Serveur appairé. Le premier envoi part avec la prochaine synchronisation.",
  unpaired: "Serveur dissocié.",
  allowHttp: "Autoriser http:// (réseau local seulement)",
  errors: {
    empty: "Collez le code d’appairage.",
    no_url: "Aucune adresse dans ce code.",
    no_secret: "Aucun secret dans ce code.",
    bad_url: "Adresse invalide.",
    not_pulse: "Ce n’est pas l’adresse d’appairage d’un serveur Pulse.",
    http: "Adresse en http:// : autorisez-la ci-dessous si le serveur est sur votre réseau local.",
    not_paired: "Aucun serveur appairé.",
    no_secret_stored: "Le secret n’est plus lisible : appairez à nouveau.",
    unreachable: "Serveur injoignable. Vérifiez le réseau et l’adresse.",
    rejected_signature: "Le serveur refuse la signature : le secret a changé. Appairez à nouveau.",
    unknown_endpoint: "Le serveur ne connaît pas cet appairage : il a été dissocié là-bas. Appairez à nouveau.",
    too_large: "Un envoi est trop gros pour le serveur (limite du proxy).",
    server_error: "Le serveur a répondu par une erreur.",
    bad_response: "Réponse inattendue du serveur.",
  } satisfies Record<PushErrorCode | "empty" | "no_url" | "bad_url" | "not_pulse" | "http" | "no_secret_stored", string>,
} as const;

const errorText = (code: string | null): string | null => (code ? ((C.errors as Record<string, string>)[code === "no_secret" ? "no_secret_stored" : code] ?? code) : null);

function usePush() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => Promise.all([readPairing(), readState()]).then(([p, s]) => (setPairing(p), setState(s))), []);
  useEffect(() => {
    void refresh();
    const un = subscribe(() => void refresh());
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh());
    return () => {
      un();
      sub.remove();
    };
  }, [refresh]);
  return { pairing, state, refresh };
}

function PairForm({ timeZone }: { timeZone: string }) {
  const [text, setText] = useState("");
  const [allowHttp, setAllowHttp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pair = async () => {
    const r = parsePairing(text, { allowHttp });
    if (!r.ok) return setError(C.errors[r.error as keyof typeof C.errors] ?? r.error);
    setPending(true);
    setError(null);
    try {
      await ping(r.pairing, timeZone);
      await savePairing(r.pairing);
      setText("");
      toast.success(C.pairedToast);
    } catch (e) {
      setError(errorText(e instanceof PushError ? e.code : "unreachable"));
    } finally {
      setPending(false);
    }
  };
  return (
    <View className="gap-4">
      <Text className={BODY}>{C.intro}</Text>
      <Field label={C.paste} hint={C.pasteHint} error={error ?? undefined}>
        <TextField value={text} onChangeText={setText} placeholder={C.placeholder} autoCapitalize="none" keyboardType="url" invalid={!!error} />
      </Field>
      <View className={ROW}>
        <Text className={cn(ROW_LABEL, "min-w-0 flex-1")}>{C.allowHttp}</Text>
        <Switch label={C.allowHttp} value={allowHttp} onValueChange={setAllowHttp} />
      </View>
      <Button onPress={() => void pair()} disabled={pending || !text.trim()}>
        {pending ? C.pairing : C.pair}
      </Button>
    </View>
  );
}

function PairedCard({ pairing, state, timeZone, now }: { pairing: Pairing; state: PushState; timeZone: string; now: number }) {
  const syncing = useApp((a) => a.status === "syncing");
  const [busy, setBusy] = useState<"sync" | "history" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const send = async (mode: "sync" | "history") => {
    const store = appState().store;
    if (!store || busy) return;
    setBusy(mode);
    setProgress(null);
    try {
      const r = await pushToServer(store, { timeZone, mode, onProgress: (done, total) => setProgress(total > 1 ? `${done}/${total}` : null) });
      toast.success(C.sent(r.sent, r.days));
    } catch (e) {
      toast.error(errorText(e instanceof PushError ? e.code : "unreachable") ?? C.errors.unreachable);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };
  const unpair = async () => {
    await clearPairing();
    setConfirm(false);
    toast.success(C.unpaired);
  };
  const lastError = errorText(state.lastError);
  return (
    <View>
      <View className="min-h-11 flex-row items-center gap-3">
        <View className="size-11 items-center justify-center rounded-xl bg-fill-faint">
          <Icon icon={CloudUpload} size={22} tone="foreground-secondary" strokeWidth={1.75} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold leading-[22px]">
            {C.paired(pairing.name, serverHost(pairing.url))}
          </Text>
          <Text numberOfLines={1} className={cn("text-[13px] leading-[18px] tabular-nums", lastError ? "text-recovery-red-text" : "text-muted-foreground")}>
            {lastError ?? (state.lastSentAt && state.lastDays != null ? C.lastSent(ago(state.lastSentAt * 1000, now), state.lastDays) : C.never)}
          </Text>
        </View>
      </View>
      <View className={cn(ROW, ROW_RULE, "mt-4")}>
        <View className="min-w-0 flex-1">
          <Text className={ROW_LABEL}>{C.auto}</Text>
          <Text className={HINT}>{C.autoHint}</Text>
        </View>
        <Switch label={C.auto} value={state.enabled} onValueChange={(v) => void writeState({ enabled: v })} />
      </View>
      <View className={cn(ROW, ROW_RULE)}>
        <Text className={ROW_LABEL}>{C.since(ago(pairing.pairedAt * 1000, now))}</Text>
        <Text className={ROW_VALUE}>{progress ?? ""}</Text>
      </View>
      <View className="mt-4 gap-2">
        <Button variant="secondary" disabled={!!busy || syncing} onPress={() => void send("sync")}>
          {busy === "sync" ? C.sending : C.sendNow}
        </Button>
        <Button variant="secondary" disabled={!!busy || syncing} onPress={() => void send("history")}>
          {busy === "history" ? C.sending : C.sendHistory}
        </Button>
        <Button variant="outline" textClassName="text-recovery-red-text" disabled={!!busy} onPress={() => setConfirm(true)}>
          {C.unpair}
        </Button>
      </View>
      <ConfirmDialog open={confirm} title={C.unpairTitle} description={C.unpairBody} confirmLabel={C.unpair} pendingLabel={C.unpairing} pending={false} onCancel={() => setConfirm(false)} onConfirm={() => void unpair()} />
    </View>
  );
}

export function ServerSection({ now }: { now: number }) {
  const timeZone = useApp((a) => a.profile?.timeZone ?? "UTC");
  const { pairing, state } = usePush();
  return (
    <SectionShell variant="card" title={C.title}>
      {pairing === undefined || !state ? null : pairing ? <PairedCard pairing={pairing} state={state} timeZone={timeZone} now={now} /> : <PairForm timeZone={timeZone} />}
    </SectionShell>
  );
}
