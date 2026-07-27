const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support for packages that ship .cjs files (lucide-react-native, etc.)
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
];

module.exports = config;
