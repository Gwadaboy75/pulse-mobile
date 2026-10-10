// The app's one GoogleAuth (token.ts) on the device's modules: the secure store, the Android Authorization API module
// and, on iOS, the ASWebAuthenticationSession sheet from expo-web-browser. Android never opens a browser.
import { Platform } from "react-native";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openAuthSessionAsync } from "expo-web-browser";
import nativeAuth from "../../modules/google-auth";
import { store } from "../data/store";
import { createGoogleAuth } from "./token";

// Readable after the first unlock (a background sync runs with the phone locked), never restored onto another device.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const googleAuth = createGoogleAuth({
  settings: store.settings,
  secure: {
    get: (key) => SecureStore.getItemAsync(key, OPTIONS),
    set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
    remove: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
  },
  platform:
    Platform.OS === "android"
      ? { os: "android", native: nativeAuth }
      : { os: "ios", openAuthSession: (url, redirect) => openAuthSessionAsync(url, redirect), randomBytes: getRandomBytes },
});
