import type { ReactNode } from "react";
import { DetailAction } from "./TabBar";

/**
 * The frame around every screen (web: AppShell + AppNav). On a phone the navigation has two parts: the tab bar, which
 * is the `tabBar` of the (tabs) layout (app/(tabs)/_layout.tsx, see TabBar.tsx), and the round check-in action that
 * floats over detail screens, which this renders around the root navigator. The rail and sidebar of the web are
 * tablet and laptop layouts and are not ported.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <DetailAction />
    </>
  );
}
