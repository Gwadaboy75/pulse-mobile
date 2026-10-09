import { useState } from "react";
import { Text, View } from "react-native";

import { sqlite } from "@/data/db";

export default function Home() {
  // The root layout renders this screen only after migrations ran, so the database is open and ready.
  const [version] = useState(() => sqlite.getFirstSync<{ v: string }>("select sqlite_version() as v")?.v);
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-2xl font-semibold text-black dark:text-white">Pulse</Text>
      <Text className="mt-2 text-neutral-500">SQLite {version}, migrations applied</Text>
    </View>
  );
}
