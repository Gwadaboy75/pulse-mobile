import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import f5 from "../../fixtures/f5-time.json";
import { checkF5 } from "@/timeParity";

type Result = ReturnType<typeof checkF5> & { ms: number };

// Dev check: runs pulse's F5 time fixture through src/time.ts on this phone's JS engine (Hermes), whose
// Intl.DateTimeFormat is the one thing in time.ts that can differ from Node. See docs/hermes-time-check.md.
export default function TimeCheck() {
  const [result, setResult] = useState<Result>();
  useEffect(() => {
    // The check is synchronous and can take seconds; a short delay lets the "Running" text paint first.
    const timer = setTimeout(() => {
      const start = Date.now();
      const r = { ...checkF5(f5), ms: Date.now() - start };
      console.log("F5", JSON.stringify({ total: r.total, failed: r.failed.length, first: r.failed.slice(0, 20) }));
      setResult(r);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const engine = "HermesInternal" in globalThis ? "Hermes" : "not Hermes";
  return (
    <ScrollView className="flex-1 bg-white dark:bg-black" contentContainerClassName="p-6 pt-16">
      <Text className="text-2xl font-semibold text-black dark:text-white">F5 time check</Text>
      <Text className="mt-1 text-neutral-500">
        {engine} · fixture from {f5.generatedFrom}
      </Text>
      {!result ? (
        <Text className="mt-6 text-black dark:text-white">Running…</Text>
      ) : (
        <View className="mt-6">
          <Text className={`text-xl font-semibold ${result.failed.length ? "text-red-600" : "text-green-600"}`}>
            {result.failed.length ? `FAIL: ${result.failed.length} of ${result.total}` : `PASS: ${result.total} of ${result.total}`}
          </Text>
          <Text className="mt-1 text-neutral-500">{result.ms} ms</Text>
          {result.failed.slice(0, 20).map((f, i) => (
            <Text key={i} selectable className="mt-4 font-mono text-xs text-black dark:text-white">
              {`${f.fn} ${JSON.stringify(f.input)}\nexpected ${JSON.stringify(f.expected)}\ngot      ${JSON.stringify(f.got)}`}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
