import { Tabs } from "expo-router";
import { TabBar } from "@/ui/shells/TabBar";

// The bottom tab bar: Home, Health, Journal, More, in the web app's order. The bar itself is src/ui/shells/TabBar.tsx
// (a floating glass bar); Expo Router's <Tabs> supplies the navigation state and the screens.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="health" options={{ title: "Health" }} />
      <Tabs.Screen name="journal" options={{ title: "Journal" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
