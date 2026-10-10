import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { deleteDatabaseSync, openDatabaseSync } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import f2json from "../../fixtures/f2-seed.json";
import { createStore } from "@/data/repos";
import migrations from "@/data/migrations/migrations";
import * as schema from "@/data/schema";
import { type PipelineOptions, recompute } from "@/pipeline";
import { dump, loadSeed } from "@/pipeline/testing/memoryStore";
import { scoreHashes } from "@/testing/canonical";
import type { F2 } from "@/testing/fixtures";
import { GOLDEN_10 } from "@/testing/golden";

const f2 = f2json as unknown as F2;
const NAME = "parity-check.db";

type Result = { steps: [string, number][]; diff: { key: string; want: string; got: string }[]; rewrites: number } | { error: string };

// Dev check: the full pipeline on this phone, under Hermes, on the app's own SQLite driver (expo-sqlite). Loads the
// F2 seed into a scratch database, recomputes every day, and compares the 21 score hashes with pulse's GOLDEN[10].
// A second run must write nothing. The scratch database is deleted afterwards. See docs/hermes-parity-check.md.
async function run(): Promise<Result> {
  const steps: [string, number][] = [];
  let t = Date.now();
  const step = (name: string) => {
    steps.push([name, Date.now() - t]);
    t = Date.now();
  };
  try {
    deleteDatabaseSync(NAME);
  } catch {
    // not there yet
  }
  const sqlite = openDatabaseSync(NAME);
  try {
    sqlite.execSync("PRAGMA foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    await migrate(db, migrations);
    const store = createStore(db);
    step("migrate");
    await loadSeed(store, f2);
    step("load F2 seed");
    const opts: PipelineOptions = { timeZone: f2.options.timeZone, profile: f2.options.profile };
    await recompute(store, opts);
    step("recompute");
    const got = scoreHashes(await dump(store));
    step("hash");
    const changes = () => sqlite.getFirstSync<{ n: number }>("select total_changes() as n")!.n;
    const before = changes();
    await recompute(store, opts);
    const rewrites = changes() - before;
    step("second run");
    const want = GOLDEN_10 as Record<string, string>;
    const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort();
    const diff = keys.filter((k) => want[k] !== got[k]).map((key) => ({ key, want: want[key] ?? "-", got: got[key] ?? "-" }));
    console.log("PARITY", JSON.stringify({ steps, diff, rewrites }));
    return { steps, diff, rewrites };
  } catch (e) {
    return { error: String(e) };
  } finally {
    sqlite.closeSync();
    deleteDatabaseSync(NAME);
  }
}

export default function ParityCheck() {
  const [state, setState] = useState<"idle" | "running" | Result>("idle");
  const engine = "HermesInternal" in globalThis ? "Hermes" : "not Hermes";
  const start = () => {
    setState("running");
    // A short delay lets "Running" paint before the long synchronous work starts.
    setTimeout(() => void run().then(setState), 50);
  };
  return (
    <ScrollView className="flex-1 bg-white dark:bg-black" contentContainerClassName="p-6 pt-16">
      <Text className="text-2xl font-semibold text-black dark:text-white">F3 score parity</Text>
      <Text className="mt-1 text-neutral-500">
        {engine} · expo-sqlite · seed from {f2.generatedFrom}
      </Text>
      {state === "idle" ? (
        <Pressable onPress={start} className="mt-6 self-start rounded-lg bg-black px-4 py-3 dark:bg-white">
          <Text className="font-semibold text-white dark:text-black">Run (takes a while)</Text>
        </Pressable>
      ) : state === "running" ? (
        <Text className="mt-6 text-black dark:text-white">Running…</Text>
      ) : "error" in state ? (
        <Text selectable className="mt-6 text-red-600">
          ERROR: {state.error}
        </Text>
      ) : (
        <View className="mt-6">
          <Text className={`text-xl font-semibold ${state.diff.length || state.rewrites ? "text-red-600" : "text-green-600"}`}>
            {state.diff.length ? `FAIL: ${state.diff.length} of 21 hashes differ` : "PASS: 21 of 21 hashes equal"}
          </Text>
          <Text className={`mt-1 ${state.rewrites ? "text-red-600" : "text-neutral-500"}`}>Second run wrote {state.rewrites} rows (want 0)</Text>
          {state.steps.map(([name, ms]) => (
            <Text key={name} className="mt-1 text-neutral-500">
              {name}: {(ms / 1000).toFixed(1)} s
            </Text>
          ))}
          {state.diff.map((d) => (
            <Text key={d.key} selectable className="mt-3 font-mono text-xs text-black dark:text-white">
              {d.key}: want {d.want}, got {d.got}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
