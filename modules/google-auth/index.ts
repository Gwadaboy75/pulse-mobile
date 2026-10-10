// Google's Android Authorization API (android/src/main/java/pulse/googleauth/GoogleAuthModule.kt). Android only:
// null on iOS and in Expo Go, which do not ship this module.
import { requireOptionalNativeModule } from "expo";

export type Authorization = { accessToken: string; grantedScopes: string[] };

export type GoogleAuthModule = {
  /** Interactive shows Google's account chooser and consent; silent never shows UI and rejects ERR_CONSENT_REQUIRED instead. */
  authorize(scopes: string[], interactive: boolean): Promise<Authorization>;
  clearToken(token: string): Promise<void>;
};

export default requireOptionalNativeModule<GoogleAuthModule>("PulseGoogleAuth");
