// The app's Google OAuth clients (project pulse-fit-510502, docs/google-console.md). Client ids are public identifiers,
// not secrets. Android's client is bound to the package and the EAS keystore's SHA-1; iOS's to the bundle id.

export const GOOGLE_CLIENTS = {
  android: "496401660534-jd20jf08ct516p4ioqic3dn9qt1gh9jn.apps.googleusercontent.com",
  ios: "496401660534-p8o7nb8ai81ulvk65fh3lvue7sbl3ol6.apps.googleusercontent.com",
  /** The reversed iOS client id: the URL scheme Google redirects to on iOS. */
  iosScheme: "com.googleusercontent.apps.496401660534-p8o7nb8ai81ulvk65fh3lvue7sbl3ol6",
} as const;
