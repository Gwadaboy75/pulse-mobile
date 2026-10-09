import "../global.css";

import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { Text, View } from "react-native";

import { db } from "@/data/db";
import migrations from "@/data/migrations/migrations";

export default function RootLayout() {
  // Migrations run at app start, as they run at boot on the web app.
  const { success, error } = useMigrations(db, migrations);
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Text className="text-red-600">Database migration failed: {error.message}</Text>
      </View>
    );
  }
  if (!success) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
