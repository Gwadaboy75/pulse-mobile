import type { ComponentProps, ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, type Href } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { cn } from "../cn";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { HEADER_TITLE, HeaderFrame, HeaderRow } from "./Header";
import { InfoButton, type InfoContent } from "./InfoButton";

export type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  info?: InfoContent;
  /** Where Back goes when there is nothing to go back to (a deep link); also the target when the screen is nested. */
  backHref?: string;
  dateTitle?: DateSwitcherProps;
  dismiss?: "back" | "close";
  align?: "center" | "start";
  titleIcon?: ReactNode;
  action?: ReactNode;
};

/** Back: pops to the previous screen; with nothing to pop (opened from a link) it replaces with `backHref`, else Home. */
function goBack(backHref?: string) {
  if (router.canGoBack()) router.back();
  else router.replace((backHref ?? "/") as Href);
}

export function DetailHeaderRow({ title, subtitle, info, backHref, dateTitle, dismiss = "back", align = "center", titleIcon, action, className, centerStyle }: DetailHeaderProps & { className?: string; centerStyle?: ComponentProps<typeof Animated.View>["style"] }) {
  const close = dismiss === "close";
  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={close ? "Close" : "Back"} onPress={() => goBack(backHref)} className="size-11 items-center justify-center rounded-full active:bg-foreground/8">
      <Icon icon={close ? X : ChevronLeft} size={close ? 24 : 26} tone="foreground" strokeWidth={1.75} />
    </Pressable>
  );
  const right = action ?? (info && <InfoButton info={info} label={title} variant="header" />);

  if (align === "start")
    return (
      <View className={cn("min-h-11 flex-row items-start gap-2 px-2", subtitle && "pb-1", className)}>
        <View className="h-11 justify-center">{back}</View>
        {titleIcon && <View className="h-11 justify-center"><View className="size-7 items-center justify-center">{titleIcon}</View></View>}
        <View className="min-w-0 flex-1 pt-3">
          <Text accessibilityRole="header" className={cn(HEADER_TITLE)} numberOfLines={1}>{title}</Text>
          {subtitle && <Text className="text-[13px] leading-[18px] tabular-nums text-foreground-secondary" numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right && <View className="h-11 justify-center">{right}</View>}
      </View>
    );

  const sub = !!subtitle && !dateTitle;
  return (
    <HeaderRow
      className={className}
      tall={sub}
      left={sub ? <View className="h-11 justify-center">{back}</View> : back}
      center={
        <Animated.View style={[centerStyle, { maxWidth: "100%", minWidth: 0, alignItems: "center", paddingTop: sub ? 12 : 0 }]}>
          {dateTitle ? (
            <DateSwitcher {...dateTitle} placement="header" />
          ) : (
            <>
              <Text accessibilityRole="header" className={cn(HEADER_TITLE, "max-w-full")} numberOfLines={1}>{title}</Text>
              {subtitle && <Text className="max-w-full text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-muted-foreground" numberOfLines={1}>{subtitle}</Text>}
            </>
          )}
        </Animated.View>
      }
      right={right && (sub ? <View className="h-11 justify-center">{right}</View> : right)}
    />
  );
}

export function DetailHeader({ onHeight, ...props }: DetailHeaderProps & { onHeight?: (height: number) => void }) {
  return (
    <HeaderFrame onHeight={onHeight}>
      <DetailHeaderRow {...props} />
    </HeaderFrame>
  );
}
