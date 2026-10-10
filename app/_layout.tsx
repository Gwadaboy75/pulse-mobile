import "../global.css";

import { useEffect } from "react";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { Barlow_500Medium } from "@expo-google-fonts/barlow/500Medium";
import { Barlow_600SemiBold } from "@expo-google-fonts/barlow/600SemiBold";
import { Barlow_700Bold } from "@expo-google-fonts/barlow/700Bold";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";

import { db } from "@/data/db";
import migrations from "@/data/migrations/migrations";
import { AppProviders } from "@/ui/providers";
import { AppShell } from "@/ui/shells/AppShell";
import { useTheme } from "@/ui/theme";

// Keep the splash screen up until the fonts and the database are ready, so no screen paints in the wrong font.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Fonts: Figtree for text, Barlow for numerals, as the web (pulse src/app/layout.tsx). Each weight is its own file
  // and its own family name; src/ui/Text.tsx picks the name from the web's font classes.
  const [fonts, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold });
  // Migrations run at app start, as they run at boot on the web app.
  const { success, error } = useMigrations(db, migrations);
  // A font that fails to load must not strand the app on the splash screen: the text falls back to the system font.
  const fontsDone = fonts || !!fontError;
  const ready = (success || !!error) && fontsDone;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-black">
        <Text className="text-red-600">Database migration failed: {error.message}</Text>
      </View>
    );
  }
  if (!success || !fontsDone) return null;
  return (
    <AppProviders>
      <Screens />
    </AppProviders>
  );
}

function Screens() {
  const { c, scheme } = useTheme();
  return (
    <AppShell>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />
    </AppShell>
  );
}
