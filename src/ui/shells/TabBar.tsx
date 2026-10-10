import { useEffect, useState, type ComponentProps } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Tabs, usePathname } from "expo-router";
import { HeartPulse, Menu, NotebookPen, type LucideIcon } from "lucide-react-native";
import { alpha } from "../color";
import { Glass } from "../Glass";
import { Gradient } from "../Gradient";
import { HomeChart } from "../icons";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { TAB_BAR_HEIGHT, useTabBarBottom } from "./layout";
import { SheetTrigger } from "./SheetTrigger";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

// The web app's tabs, in its order (src/lib/url.ts TAB_ROOT): Home, Health, Journal, More. The route file of each is
// app/(tabs)/<route>.tsx.
export const TABS: { route: string; label: string; icon: LucideIcon }[] = [
  { route: "index", label: "Home", icon: HomeChart },
  { route: "health", label: "Health", icon: HeartPulse },
  { route: "journal", label: "Journal", icon: NotebookPen },
  { route: "more", label: "More", icon: Menu },
];

/** The reference app's ringed monogram: "P" in a 30 px circle with the indigo-to-blue rim. */
function Monogram() {
  const { c } = useTheme();
  return (
    <View accessibilityElementsHidden className="size-[30px] items-center justify-center">
      <Svg width={30} height={30} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c["action-rim-from"]} />
            <Stop offset="1" stopColor={c["action-rim-to"]} />
          </LinearGradient>
        </Defs>
        <Circle cx={15} cy={15} r={14.25} fill={c["action-face"]} stroke="url(#rim)" strokeWidth={1.5} />
      </Svg>
      <Text className="font-numeric text-[15px] font-bold leading-[15px] text-foreground">P</Text>
    </View>
  );
}

/**
 * The "Check in" action (spec §4.2.1): indigo-rimmed glass with the "P" monogram, floating beside the tab bar (on tab roots)
 * or alone (on detail screens). It opens the check-in sheet over the screen you are on (sheets.ts); the Journal stream
 * renders that sheet. Where the coach is on, this button opens the coach instead (the web's coach access); that wiring
 * arrives with the coach stream, through `onPress`.
 */
export function CheckInAction({ label = "Check in", onPress }: { label?: string; onPress?: () => void }) {
  return (
    <SheetTrigger sheet="checkin" accessibilityLabel={label} onPress={onPress} className="active:scale-[0.96]">
      <Glass radius={22} action style={{ width: TAB_BAR_HEIGHT, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center" }}>
        <Monogram />
      </Glass>
    </SheetTrigger>
  );
}

/**
 * The active item's lens: one element that slides between items (150 ms), a soft pool of light that is brightest at the
 * item's lower edge, as sampled under the reference app's active tab.
 */
function Lens({ index, itemWidth }: { index: number; itemWidth: number }) {
  const { c } = useTheme();
  const x = useSharedValue(index * itemWidth);
  useEffect(() => {
    x.value = withTiming(index * itemWidth, { duration: 150 });
  }, [index, itemWidth, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: index < 0 ? 0 : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 4, top: 4, bottom: 4, width: itemWidth, borderRadius: 18, overflow: "hidden" }, style]}>
      <Gradient from={alpha(c.foreground, 0.02)} to={alpha(c.foreground, 0.16)} angle="y" />
    </Animated.View>
  );
}

/** Phone tab bar: a 62 px glass squircle with four destinations (spec §4.2, G1), for expo-router's <Tabs tabBar>. */
function Bar({ state, navigation, current }: TabBarProps & { current: number }) {
  const [width, setWidth] = useState(0);
  const itemWidth = Math.max(0, (width - 8) / TABS.length);
  return (
    <Glass radius={22} accessibilityRole="tablist" accessibilityLabel="Primary" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: TAB_BAR_HEIGHT, flex: 1, minWidth: 0, padding: 4 }}>
      {width > 0 && <Lens index={current} itemWidth={itemWidth} />}
      <View className="h-full flex-row">
        {TABS.map(({ route, label, icon }, i) => {
          const route_ = state.routes.find((r) => r.name === route);
          const on = i === current;
          return (
            <Pressable
              key={route}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (!route_) return;
                const event = navigation.emit({ type: "tabPress", target: route_.key, canPreventDefault: true });
                if (!on && !event.defaultPrevented) navigation.navigate(route_.name);
              }}
              className="h-full min-w-0 flex-1 items-center justify-center gap-0.5 rounded-[18px] active:scale-[0.96]"
            >
              <Icon icon={icon} size={26} tone={on ? "foreground" : "muted-foreground"} strokeWidth={1.6} />
              <Text className={on ? "text-[11px] font-semibold leading-[13px] text-foreground" : "text-[11px] font-semibold leading-[13px] text-muted-foreground"}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

/** The tab bar and the round action, floating over the content at the bottom of the screen (tab roots). */
export function TabBar(props: TabBarProps) {
  const bottom = useTabBarBottom();
  const route = props.state.routes[props.state.index];
  const current = TABS.findIndex((t) => t.route === route?.name);
  return (
    <View pointerEvents="box-none" className="absolute inset-x-3 flex-row justify-end gap-2" style={{ bottom }}>
      <Bar {...props} current={current} />
      <CheckInAction />
    </View>
  );
}

/** Detail screens show the round action alone (spec §4.2); not on Settings, the coach or the dev kit. */
export function DetailAction() {
  const pathname = usePathname();
  const bottom = useTabBarBottom();
  const root = ["/", "/health", "/journal", "/more"].includes(pathname);
  if (root || pathname.startsWith("/settings") || pathname.startsWith("/coach") || (pathname.startsWith("/dev") && !pathname.startsWith("/dev/kit/detail"))) return null;
  return (
    <View pointerEvents="box-none" className="absolute right-3" style={{ bottom }}>
      <CheckInAction />
    </View>
  );
}
