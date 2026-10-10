import { useIsFocused, useNavigation, useRoute, type NativeStackNavigationProp } from "expo-router";
import { useLayoutEffect, useState } from "react";
import { Platform } from "react-native";

export function useScreenReady() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const route = useRoute();
  const focused = useIsFocused();
  const state = navigation.getState();
  const defer = Platform.OS === "android" && state.type === "stack";
  const [settled, setSettled] = useState(() => !defer || state.index === 0);

  useLayoutEffect(() => {
    if (!defer) return;
    let frame: number | undefined;
    let started: number | undefined;
    let previous = 0;
    let gaps = 0;
    let maxGap = 0;
    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    };
    const probe = (now: number) => {
      const gap = now - previous;
      if (gap > 32) gaps++;
      maxGap = Math.max(maxGap, gap);
      previous = now;
      frame = requestAnimationFrame(probe);
    };
    const start = navigation.addListener("transitionStart", ({ data }) => {
      setSettled(false);
      if (__DEV__) {
        stop();
        started = performance.now();
        previous = started;
        gaps = 0;
        maxGap = 0;
        frame = requestAnimationFrame(probe);
        console.info(`[screen] ${route.name} transition-start closing=${data.closing}`);
      }
    });
    const end = navigation.addListener("transitionEnd", ({ data }) => {
      stop();
      if (__DEV__ && started !== undefined) {
        const now = performance.now();
        const gap = now - previous;
        if (gap > 32) gaps++;
        maxGap = Math.max(maxGap, gap);
        console.info(`[screen] ${route.name} transition-end closing=${data.closing} ms=${Math.round(now - started)} js-gaps=${gaps} js-max-gap-ms=${Math.round(maxGap)}`);
        started = undefined;
      }
      if (!data.closing) setSettled(true);
    });
    const cancel = navigation.addListener("gestureCancel", () => {
      stop();
      setSettled(true);
    });
    const blur = navigation.addListener("blur", () => {
      stop();
      setSettled(false);
    });
    return () => {
      stop();
      start();
      end();
      cancel();
      blur();
    };
  }, [defer, navigation, route.name]);

  return focused && (!defer || settled);
}
