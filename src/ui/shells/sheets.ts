import { router } from "expo-router";
import { push } from "../navigate";

// Task pages (check-in, the log pages, info cards): what the web shows in a drawer is a full-screen page here, pushed
// like every detail page (the stack's slide, the header with Back and the caps title, the Android back gesture). The
// owner did not want bottom sheets. The routes keep their names, so a deep link (`pulse://checkin`) still opens them.
// To add one:
//
//   1. app/(sheets)/<name>.tsx  renders <SheetScreen title=...>...</SheetScreen>  (the `(sheets)` group is only a
//      folder: the route is /<name>).
//   2. app/_layout.tsx          <Stack.Screen name="(sheets)/<name>" />  (inside the onboarded guard).
//   3. anywhere                 openSheet("/<name>")  (closeSheet() closes the one on top).

/** Opens a task page over the current screen. `href` is the page's route ("/checkin"), with its params if any. */
export function openSheet(href: string) {
  push(href);
}

/** Closes the task page on top (Back). With nothing to go back to (a deep link) it lands on Home. */
export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
