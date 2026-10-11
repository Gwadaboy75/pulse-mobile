const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// babel.config.js imports lucide's createLucideIcon from its own file, which the package's "exports" does not list.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) =>
  (resolveRequest ?? context.resolveRequest)(name.startsWith("lucide-react-native/dist/") ? { ...context, unstable_enablePackageExports: false } : context, name, platform);

module.exports = withNativeWind(config, { input: "./global.css" });
